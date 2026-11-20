import type { Env } from "../env.ts";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 100;
const MAX_ATTEMPTS = 5;

export interface IndexNowPayload { host: string; key: string; keyLocation: string; urlList: string[]; }

/** IndexNow request body. keyLocation proves key ownership (served at /{key}.txt). */
export function indexnowPayload(site: string, key: string, urls: string[]): IndexNowPayload {
  const host = site.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: [...new Set(urls)] };
}

const cleanUrls = (urls: string[]) => [...new Set(urls)].filter((u) => /^https:\/\/[A-Za-z0-9.-]+\/\S{0,2000}$/.test(u)).slice(0, 1000);

/** Frontend detail segments (ACTIVITY → things-to-do; API uses /activities). */
const PAGE_SEGMENTS: Record<string, string> = { HOTEL: "hotels", FLIGHT: "flights", TRAIN: "trains", CAR: "cars", TRANSFER: "transfers", ACTIVITY: "things-to-do", PACKAGE: "packages" };

/** Public detail URL for one catalog write. "" when the domain/id is unknown. */
export function productPageUrl(env: Env, domain: string, itemId: string): string {
  const seg = PAGE_SEGMENTS[String(domain || "").toUpperCase()];
  if (!seg || !/^[A-Za-z0-9_-]{1,100}$/.test(itemId)) return "";
  return `${(env.PUBLIC_SITE_URL || "https://getfortrip.com").replace(/\/+$/, "")}/${seg}/detail/${itemId}`;
}

/** Queue changed URLs for IndexNow submission (Bing/Yandex/Seznam + Naver via Bing). */
export async function enqueueIndexNow(env: Env, urls: string[]): Promise<number> {
  const list = cleanUrls(urls);
  if (!list.length) return 0;
  try {
    const stmts = list.map((u) => env.DB.prepare("INSERT OR IGNORE INTO indexnow_queue (url) VALUES (?)").bind(u));
    await env.DB.batch(stmts);
    return list.length;
  } catch { return 0; }
}

type Submit = (payload: IndexNowPayload) => Promise<{ ok: boolean; status: number; error?: string }>;

const defaultSubmit: Submit = async (p) => {
  try {
    const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p), signal: AbortSignal.timeout(10000) });
    return { ok: r.ok || r.status === 202, status: r.status };
  } catch (e) { return { ok: false, status: 0, error: String(e).slice(0, 200) }; }
};

interface Row { url: string; attempts: number; }

/** Cron pump: submit one PENDING batch, mark SENT or requeue with backoff. No key = honest no-op. */
export async function pumpIndexNow(env: Env, submit: Submit = defaultSubmit): Promise<{ submitted: number; failed: number; skipped: boolean }> {
  const key = env.INDEXNOW_KEY || "";
  const site = env.PUBLIC_SITE_URL || "https://getfortrip.com";
  if (!key) return { submitted: 0, failed: 0, skipped: true };
  let rows: Row[] = [];
  try {
    const r = await env.DB.prepare("SELECT url, attempts FROM indexnow_queue WHERE status = 'PENDING' ORDER BY created_at LIMIT ?").bind(BATCH).all<Row>();
    rows = r.results || [];
  } catch { return { submitted: 0, failed: 0, skipped: true }; }
  if (!rows.length) return { submitted: 0, failed: 0, skipped: false };
  const res = await submit(indexnowPayload(site, key, rows.map((x) => x.url)));
  const done = res.ok ? "SENT" : "PENDING";
  const err = res.ok ? null : (res.error || `http_${res.status}`).slice(0, 200);
  const stmts = rows.map((x) => {
    const dead = !res.ok && x.attempts + 1 >= MAX_ATTEMPTS;
    return env.DB.prepare("UPDATE indexnow_queue SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE url = ?").bind(dead ? "DEAD" : done, err, x.url);
  });
  try { await env.DB.batch(stmts); } catch { /* retry next tick */ }
  return { submitted: res.ok ? rows.length : 0, failed: res.ok ? 0 : rows.length, skipped: false };
}
