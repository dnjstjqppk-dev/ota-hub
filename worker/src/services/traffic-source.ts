/**
 * S10: traffic-source classification for analytics events.
 * Pure (no env/DB): given landing referrer + utm, name the channel. ai_answer
 * covers AI answer engines; everything else follows standard channel rules.
 */
import type { Env } from "../env.ts";

export type TrafficSource = "ai_answer" | "organic" | "social" | "paid" | "referral" | "direct";

export interface TrafficInput {
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
}

const AI_HOSTS = [
  "chatgpt.com", "chat.openai.com", "openai.com", "perplexity.ai", "copilot.microsoft.com",
  "gemini.google.com", "claude.ai", "anthropic.com", "meta.ai", "grok.com", "x.ai",
  "you.com", "poe.com",
];
const AI_SOURCE_TOKENS = [
  "chatgpt", "openai", "perplexity", "copilot", "gemini", "claude", "anthropic",
  "meta.ai", "grok", "x.ai", "you.com", "poe",
];
const SEARCH_HOSTS = [
  "google.", "naver.com", "bing.com", "duckduckgo.com", "yahoo.", "daum.net",
  "nate.com", "ecosia.org", "baidu.com", "yandex.", "seznam.cz", "brave.com",
];
const SEARCH_SOURCE_TOKENS = ["google", "naver", "bing", "duckduckgo", "yahoo", "daum", "ecosia", "baidu", "yandex"];
const SOCIAL_HOSTS = [
  "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com", "youtu.be",
  "tiktok.com", "linkedin.com", "pinterest.", "threads.", "reddit.com", "snapchat.com",
];
const SOCIAL_SOURCE_TOKENS = ["facebook", "instagram", "twitter", "youtube", "tiktok", "linkedin", "pinterest", "threads", "reddit", "snapchat"];
const PAID_MEDIUMS = ["cpc", "ppc", "paid", "paidsearch", "paid-search", "paid_social", "paidsocial", "display", "cpm", "retargeting", "ads"];
const SOCIAL_MEDIUMS = ["social", "social-network", "social-media", "smm", "organic-social"];

function hostOf(ref: string): string | null {
  try {
    const h = new URL(ref).hostname.toLowerCase();
    return h || null;
  } catch { return null; }
}

/** Exact or subdomain match; a base ending in "." matches any suffix start (google.* ccTLDs). */
function hostMatches(host: string, ...bases: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return bases.some((b) => {
    const base = b.toLowerCase();
    if (base.endsWith(".")) return h.includes(`.${base}`) || h.startsWith(base);
    return h === base || h.endsWith(`.${base}`);
  });
}

const hasToken = (v: string, tokens: string[]): boolean => {
  const s = v.toLowerCase();
  return tokens.some((t) => s.includes(t));
};

/**
 * Classify a landing. ownHosts (apex + local dev hosts) are treated as
 * self-referral and ignored, so in-product navigation never invents sources.
 */
export function classifyTrafficSource(input: TrafficInput, ownHosts: string[] = []): TrafficSource {
  const medium = (input.utmMedium || "").trim().toLowerCase();
  if (medium && PAID_MEDIUMS.includes(medium)) return "paid";
  if (medium && SOCIAL_MEDIUMS.includes(medium)) return "social";
  const source = (input.utmSource || "").trim();
  if (source) {
    if (hasToken(source, AI_SOURCE_TOKENS)) return "ai_answer";
    if (hasToken(source, SEARCH_SOURCE_TOKENS)) return "organic";
    if (hasToken(source, SOCIAL_SOURCE_TOKENS)) return "social";
  }
  const ref = (input.referrer || "").trim();
  if (ref) {
    const host = hostOf(ref);
    if (host && !hostMatches(host, ...ownHosts)) {
      if (hostMatches(host, ...AI_HOSTS)) return "ai_answer";
      if (hostMatches(host, ...SEARCH_HOSTS)) return "organic";
      if (hostMatches(host, ...SOCIAL_HOSTS)) return "social";
      return "referral";
    }
  }
  return "direct";
}

/** Apex + local dev hosts treated as self-referral (never a traffic source). */
export function ownHostsOf(env: Env): string[] {
  try {
    return [new URL(env.PUBLIC_SITE_URL || "https://getfortrip.com").hostname, "localhost", "127.0.0.1"];
  } catch {
    return ["getfortrip.com", "localhost", "127.0.0.1"];
  }
}

/** Read first-touch attribution headers the portal plugin attaches (S10). */
export function attributionFromRequest(request: Request, ownHosts: string[] = []): { source: TrafficSource; sessionId: string | null } | null {
  const h = request.headers;
  const sid = (h.get("x-session-id") || "").trim().slice(0, 64);
  const ref = (h.get("x-landing-ref") || "").trim().slice(0, 512);
  const utm = (h.get("x-landing-utm") || "").trim().slice(0, 512);
  if (!sid && !ref && !utm) return null;
  let utmSource: string | null = null, utmMedium: string | null = null;
  if (utm) {
    try {
      const q = new URLSearchParams(utm.startsWith("?") ? utm : `?${utm}`);
      utmSource = q.get("utm_source");
      utmMedium = q.get("utm_medium");
    } catch { /* malformed blob: referrer-only classification */ }
  }
  return { source: classifyTrafficSource({ referrer: ref || null, utmSource, utmMedium }, ownHosts), sessionId: sid || null };
}
