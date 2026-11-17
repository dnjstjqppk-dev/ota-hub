import type { Env } from "../env.ts";
import type { Db } from "../db/database.ts";
import { db as portableDb } from "../db/database.ts";
import { newId } from "../lib/crypto.ts";
import { HttpError } from "../lib/http.ts";
import { isFeatureEnabled } from "./feature-flag-service.ts";
import { assignVariant } from "./reco-service.ts";
import { generateText, scrubOutput, type AiTextRunner } from "./ai-service.ts";

/**
 * TG-21: CS bot v1 (first response + one-click human handoff).
 *
 * Treatment members get an instant first reply on every ticket they open
 * or follow up; control members get humans only. Bot messages post as
 * ADMIN/`bot:cs-v1` (no thread CHECK churn) and the UI badges them.
 * The bot is rules-first: booking lookup, cancel/refund guide, payment
 * guide, FAQ menu. Workers AI drafts only when bound — and every output,
 * AI or rule, passes the PII/blocklist filter.
 *
 * Handoff is always one click: NEEDS_HUMAN + handoff_at, due 24h later.
 * Wrong-answer reports land in bot_reports (the learning queue) and
 * auto-handoff. The bot never resolves, never refunds, never promises.
 */

export const CS_BOT_EXPERIMENT = "cs-bot-v1";
export const CS_BOT_FLAG = "CS_BOT";
export const BOT_AUTHOR_ID = "bot:cs-v1";
export const SYSTEM_AUTHOR_ID = "system";
export const HANDOFF_SLA_MS = 24 * 3600_000;

export type BotIntent = "booking_lookup" | "cancel_guide" | "payment_guide" | "faq_menu";

const INTENT_RULES: Array<{ intent: BotIntent; re: RegExp }> = [
  { intent: "cancel_guide", re: /(취소|환불|cancel|refund)/i },
  { intent: "payment_guide", re: /(결제|카드|수단|payment|pay)/i },
  { intent: "booking_lookup", re: /(예약|조회|확인|번호|booking|reservation)/i },
];

export function detectIntent(text: string): BotIntent {
  const t = String(text || "");
  for (const r of INTENT_RULES) {
    if (r.re.test(t)) return r.intent;
  }
  return "faq_menu";
}

interface TicketRow {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  booking_id: string | null;
  status: string;
}

async function latestBooking(db: Db, userId: string): Promise<{ booking_number: string; title: string; status: string; service_start: string } | null> {
  return db.prepare(
    "SELECT booking_number, title, status, service_start FROM bookings WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(userId).first<any>();
}

function ruleReply(intent: BotIntent, booking: { booking_number: string; title: string; status: string; service_start: string } | null, userName: string): string {
  const head = `[자동 응답] ${userName}님, 먼저 안내드려요.`;
  switch (intent) {
    case "booking_lookup":
      if (booking) {
        return `${head}\n최근 예약: ${booking.booking_number} (${booking.title}) · 상태 ${booking.status} · 이용일 ${String(booking.service_start || "").slice(0, 10)}.\n상세 변경·취소는 예약 상세에서 진행하시고, 추가로 필요한 점은 이 대화에 남겨주세요.`;
      }
      return `${head}\n조회되는 예약이 없어요. 예약 번호를 알려주시면 바로 확인해드릴게요.`;
    case "cancel_guide":
      return `${head}\n취소·환불 안내: 예약 상세 → 취소하기에서 위약금과 환불 예정액을 먼저 확인할 수 있어요. 무료 취소 기한이 지난 예약은 위약금이 발생할 수 있습니다. 처리에 문제가 있으면 이 대화에 남겨주세요.`;
    case "payment_guide":
      return `${head}\n결제 안내: 국내 카드·간편결제를 지원하며, 모든 결제는 KRW 청구입니다. 결제 실패 시 카드 한도·해외승인 차단 여부를 먼저 확인해주세요.`;
    default:
      return `${head}\n자주 묻는 안내: ① 예약 조회 — 예약 번호를 알려주세요 ② 취소·환불 — 예약 상세에서 위약금 확인 ③ 결제 — KRW 청구, 카드·간편결제. 바로 해결이 필요하면 아래 '상담원 연결'을 눌러주세요.`;
  }
}

export interface BotReply {
  replied: boolean;
  variant: "control" | "treatment" | null;
  intent: BotIntent | null;
  source: "ai" | "rules" | null;
  messageId: string | null;
}

const BOT_SYSTEM = [
  "너는 여행 플랫폼의 1차 상담원이다. 한국어로 500자 이내로 답한다.",
  "예약 조회·취소 안내·결제 안내는 사실만 답하고, 모르면 모른다고 하고 사람 연결을 권한다.",
  "개인정보를 묻지도 답하지도 않는다. 환불 확약·보상 약속은 절대 하지 않는다.",
].join(" ");

/**
 * Post a bot first-reply after a customer message (create + follow-up).
 * Control arm and flag-off return unreplied with zero side effects.
 */
export async function maybeBotReply(
  env: Env,
  ticket: TicketRow,
  userMsg: string,
  userName: string,
  runner?: AiTextRunner,
): Promise<BotReply> {
  const idle = (variant: BotReply["variant"] = null): BotReply => ({ replied: false, variant, intent: null, source: null, messageId: null });
  if (!await isFeatureEnabled(env, CS_BOT_FLAG)) return idle();
  const db = portableDb(env);
  const variant = await assignVariant(db, ticket.user_id, CS_BOT_EXPERIMENT);
  if (variant === "control") return idle("control");
  const intent = detectIntent(`${ticket.subject} ${userMsg}`);
  const booking = intent === "booking_lookup" ? await latestBooking(db, ticket.user_id) : null;
  let body = ruleReply(intent, booking, userName);
  let source: "ai" | "rules" = "rules";
  const ai = await generateText(env, {
    system: BOT_SYSTEM,
    user: `분류:${ticket.category} / 제목:${ticket.subject.slice(0, 120)} / 고객:${userMsg.slice(0, 800)}`,
  }, runner);
  if (ai.text) {
    body = ai.text;
    source = "ai";
  } else {
    body = scrubOutput(body);
  }
  const id = newId("tmsg");
  const ts = new Date().toISOString();
  await db.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author_type, author_id, body, created_at) VALUES (?, ?, 'ADMIN', ?, ?, ?)")
    .bind(id, ticket.id, BOT_AUTHOR_ID, body.slice(0, 2000), ts).run();
  await db.prepare("UPDATE support_tickets SET updated_at = ? WHERE id = ?").bind(ts, ticket.id).run();
  return { replied: true, variant, intent, source, messageId: id };
}

export async function handoffTicket(env: Env, ticketId: string, userId: string): Promise<{ status: string; handoffAt: string; dueAt: string }> {
  const db = portableDb(env);
  const t = await db.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(ticketId, userId).first<any>();
  if (!t) throw new HttpError(404, "TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.");
  if (t.status === "CLOSED") throw new HttpError(409, "TICKET_CLOSED", "종료된 문의는 이관할 수 없습니다.");
  const ts = new Date().toISOString();
  const due = new Date(Date.now() + HANDOFF_SLA_MS).toISOString();
  await db.prepare("UPDATE support_tickets SET status = 'NEEDS_HUMAN', handoff_at = ?, updated_at = ? WHERE id = ?").bind(ts, ts, ticketId).run();
  await db.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author_type, author_id, body, created_at) VALUES (?, ?, 'ADMIN', ?, ?, ?)")
    .bind(newId("tmsg"), ticketId, SYSTEM_AUTHOR_ID, "상담원 연결을 요청했습니다. 영업일 기준 24시간 안에 담당자가 답변드려요.", ts).run();
  return { status: "NEEDS_HUMAN", handoffAt: ts, dueAt: due };
}

export async function reportBotMessage(
  env: Env,
  input: { ticketId: string; messageId: string; userId: string; reason: string | null },
): Promise<{ reported: boolean; handoff: { status: string; handoffAt: string; dueAt: string } }> {
  const db = portableDb(env);
  const t = await db.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(input.ticketId, input.userId).first<any>();
  if (!t) throw new HttpError(404, "TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.");
  const m = await db.prepare("SELECT id, author_id FROM support_ticket_messages WHERE id = ? AND ticket_id = ?").bind(input.messageId, input.ticketId).first<any>();
  if (!m) throw new HttpError(404, "MESSAGE_NOT_FOUND", "메시지를 찾을 수 없습니다.");
  if (m.author_id !== BOT_AUTHOR_ID) throw new HttpError(400, "NOT_A_BOT_MESSAGE", "봇 답변에만 오답 신고를 할 수 있습니다.");
  await db.prepare("INSERT OR IGNORE INTO bot_reports (id, ticket_id, message_id, user_id, reason) VALUES (?, ?, ?, ?, ?)")
    .bind(newId("botr"), input.ticketId, input.messageId, input.userId, (input.reason || "").slice(0, 500) || null).run();
  const handoff = await handoffTicket(env, input.ticketId, input.userId);
  return { reported: true, handoff };
}

export interface CsBotMetrics {
  variant: "control" | "treatment";
  tickets: number;
  botReplied: number;
  handoffs: number;
  reports: number;
  resolved: number;
}

export async function csBotMetrics(db: Db): Promise<CsBotMetrics[]> {
  const rows = await db.prepare(
    `SELECT a.variant AS variant,
       COUNT(DISTINCT t.id) AS tickets,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM support_ticket_messages m WHERE m.ticket_id = t.id AND m.author_id = '${BOT_AUTHOR_ID}') THEN t.id END) AS bot_replied,
       COUNT(DISTINCT CASE WHEN t.handoff_at IS NOT NULL THEN t.id END) AS handoffs,
       COUNT(DISTINCT r.id) AS reports,
       COUNT(DISTINCT CASE WHEN t.status IN ('RESOLVED','CLOSED') THEN t.id END) AS resolved
     FROM experiment_assignments a
     LEFT JOIN support_tickets t ON t.user_id = a.subject_id
     LEFT JOIN bot_reports r ON r.ticket_id = t.id
     WHERE a.experiment = '${CS_BOT_EXPERIMENT}'
     GROUP BY a.variant`,
  ).bind().all<any>();
  return (["control", "treatment"] as const).map((variant) => {
    const r = (rows.results || []).find((x: any) => x.variant === variant) || {};
    return {
      variant,
      tickets: Number(r.tickets || 0),
      botReplied: Number(r.bot_replied || 0),
      handoffs: Number(r.handoffs || 0),
      reports: Number(r.reports || 0),
      resolved: Number(r.resolved || 0),
    };
  });
}
