import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../src/lib/http.ts";
import {
  BOT_AUTHOR_ID,
  csBotMetrics,
  detectIntent,
  handoffTicket,
  maybeBotReply,
  reportBotMessage,
} from "../../src/services/csbot-service.ts";
import { fakeDb } from "./_fakedb.ts";

/** TG-21: bot intents, replies, handoff, reports, and metrics. */

function botDb(opts: {
  flag?: number; assignment?: string | null; ticket?: any; message?: any;
  booking?: any; metrics?: any[];
} = {}) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db = fakeDb({
    first: (sql, params) => {
      if (sql.includes("FROM feature_flags")) return { is_enabled: opts.flag ?? 0 };
      if (sql.includes("FROM experiment_assignments")) {
        return opts.assignment ? { variant: opts.assignment } : null;
      }
      if (sql.includes("FROM support_tickets WHERE id")) return params[1] === "u1" ? (opts.ticket ?? null) : null;
      if (sql.includes("FROM support_ticket_messages WHERE id")) return opts.message ?? null;
      if (sql.includes("FROM bookings WHERE user_id")) return opts.booking ?? null;
      return null;
    },
    all: (sql) => {
      if (sql.includes("FROM experiment_assignments a")) return opts.metrics || [];
      return [];
    },
    run: (sql, params) => {
      writes.push({ sql, params });
      return { meta: { changes: 1 } };
    },
  });
  return { db, writes };
}

const TICKET = { id: "tkt_1", user_id: "u1", category: "BOOKING", subject: "예약 확인", booking_id: null, status: "OPEN" };

test("csbot: intents match Korean and English keywords, default is the menu", () => {
  assert.equal(detectIntent("예약 조회하고 싶어요"), "booking_lookup");
  assert.equal(detectIntent("Where is my booking?"), "booking_lookup");
  assert.equal(detectIntent("취소하고 환불해주세요"), "cancel_guide");
  assert.equal(detectIntent("refund please"), "cancel_guide");
  assert.equal(detectIntent("카드 결제가 안 돼요"), "payment_guide");
  assert.equal(detectIntent("그냥 안녕하세요"), "faq_menu");
});

test("csbot: flag off and control arm stay silent", async () => {
  const off = botDb({});
  assert.deepEqual(await maybeBotReply({ DB: off.db } as any, TICKET, "예약 조회", "김민지"), {
    replied: false, variant: null, intent: null, source: null, messageId: null,
  });
  assert.deepEqual(off.writes, []);
  const ctl = botDb({ flag: 1, assignment: "control" });
  const r = await maybeBotReply({ DB: ctl.db } as any, TICKET, "예약 조회", "김민지");
  assert.equal(r.replied, false);
  assert.equal(r.variant, "control");
  assert.deepEqual(ctl.writes, []);
});

test("csbot: treatment posts a rule reply as the bot author", async () => {
  const { db, writes } = botDb({ flag: 1, assignment: "treatment", booking: { booking_number: "GFT-1", title: "T", status: "CONFIRMED", service_start: "2027-01-01" } });
  const r = await maybeBotReply({ DB: db } as any, TICKET, "내 예약 조회해줘", "김민지");
  assert.equal(r.replied, true);
  assert.equal(r.variant, "treatment");
  assert.equal(r.intent, "booking_lookup");
  assert.equal(r.source, "rules");
  assert.ok(r.messageId);
  const insert = writes.find((w) => w.sql.includes("INTO support_ticket_messages"));
  assert.ok(insert);
  assert.ok(insert.params.includes(BOT_AUTHOR_ID));
  assert.ok(String(insert.params[insert.params.length - 2]).includes("GFT-1"));
});

test("csbot: AI drafts win when usable, rules cover failures", async () => {
  const ok: any = { run: async () => ({ response: "AI 답변 010-0000-0000" }) };
  const { db, writes } = botDb({ flag: 1, assignment: "treatment" });
  const r = await maybeBotReply({ DB: db } as any, TICKET, "hello", "김민지", ok);
  assert.equal(r.source, "ai");
  const body = String(writes.find((w) => w.sql.includes("INTO support_ticket_messages"))?.params[3] || "");
  assert.ok(body.includes("[연락처]"), "AI output is filtered before display");

  const bad: any = { run: async () => { throw new Error("down"); } };
  const fb = botDb({ flag: 1, assignment: "treatment" });
  const r2 = await maybeBotReply({ DB: fb.db } as any, TICKET, "hello", "김민지", bad);
  assert.equal(r2.source, "rules");
  assert.equal(r2.replied, true);
});

test("csbot: handoff flips status with a 24h due clock", async () => {
  const { db, writes } = botDb({ ticket: TICKET });
  const h = await handoffTicket({ DB: db } as any, "tkt_1", "u1");
  assert.equal(h.status, "NEEDS_HUMAN");
  assert.equal(Date.parse(h.dueAt) - Date.parse(h.handoffAt), 24 * 3600_000);
  assert.ok(writes.some((w) => w.sql.includes("UPDATE support_tickets SET status = 'NEEDS_HUMAN'")));
  assert.ok(writes.some((w) => w.sql.includes("INTO support_ticket_messages")));
  await assert.rejects(() => handoffTicket({ DB: db } as any, "tkt_1", "stranger"), (e: unknown) => {
    assert.ok(e instanceof HttpError && e.code === "TICKET_NOT_FOUND");
    return true;
  });
  const closed = botDb({ ticket: { ...TICKET, status: "CLOSED" } });
  await assert.rejects(() => handoffTicket({ DB: closed.db } as any, "tkt_1", "u1"), (e: unknown) => {
    assert.ok(e instanceof HttpError && e.code === "TICKET_CLOSED");
    return true;
  });
});

test("csbot: red drill 3 shape — reports queue learning and auto-handoff", async () => {
  const { db, writes } = botDb({ ticket: TICKET, message: { id: "m1", author_id: BOT_AUTHOR_ID } });
  const r = await reportBotMessage({ DB: db } as any, { ticketId: "tkt_1", messageId: "m1", userId: "u1", reason: "틀렸어요" });
  assert.equal(r.reported, true);
  assert.equal(r.handoff.status, "NEEDS_HUMAN");
  assert.ok(writes.some((w) => w.sql.includes("INTO bot_reports")));
  const human = botDb({ ticket: TICKET, message: { id: "m2", author_id: "admin_1" } });
  await assert.rejects(() => reportBotMessage({ DB: human.db } as any, { ticketId: "tkt_1", messageId: "m2", userId: "u1", reason: null }), (e: unknown) => {
    assert.ok(e instanceof HttpError && e.code === "NOT_A_BOT_MESSAGE");
    return true;
  });
});

test("csbot: metrics map both arms with zero-safe defaults", async () => {
  const { db } = botDb({
    metrics: [
      { variant: "control", tickets: 10, bot_replied: 0, handoffs: 6, reports: 0, resolved: 7 },
      { variant: "treatment", tickets: 10, bot_replied: 9, handoffs: 2, reports: 1, resolved: 8 },
    ],
  });
  const m = await csBotMetrics(db as any);
  assert.equal(m.length, 2);
  assert.deepEqual(m[1], { variant: "treatment", tickets: 10, botReplied: 9, handoffs: 2, reports: 1, resolved: 8 });
  const empty = await csBotMetrics(botDb({}).db as any);
  assert.deepEqual(empty[0], { variant: "control", tickets: 0, botReplied: 0, handoffs: 0, reports: 0, resolved: 0 });
});
