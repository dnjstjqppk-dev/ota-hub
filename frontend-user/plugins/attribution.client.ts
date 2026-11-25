/**
 * S10: first-touch attribution beacon (client only). Captures the tab's landing
 * referrer + utm once per session and forwards them on same-origin /api/* calls
 * so the hub can classify traffic sources (ai_answer, organic, ...). Best
 * effort: storage/fetch failures must never break the page.
 */
import { parseLandingAttribution, shouldTagRequest, withAttributionHeaders, type LandingAttribution } from '~/utils/attribution'

const KEY = 'gft_attribution_v1'

function loadAttribution(): LandingAttribution {
  const fallback = (): LandingAttribution => ({
    sid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ref: '',
    utm: '',
  });
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.sid === 'string' && parsed.sid) return parsed as LandingAttribution;
    }
    const { ref, utm } = parseLandingAttribution(location.search, document.referrer);
    const fresh: LandingAttribution = {
      sid: (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? globalThis.crypto.randomUUID() : fallback().sid,
      ref,
      utm,
    };
    sessionStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return fallback();
  }
}

export default defineNuxtPlugin(() => {
  const attr = loadAttribution();
  const origFetch = globalThis.fetch.bind(globalThis);
  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      // String URLs only: Request objects carry their own headers, which init
      // headers would replace instead of extend.
      if (shouldTagRequest(input, location.origin)) {
        init = { ...(init || {}), headers: withAttributionHeaders(init as { headers?: HeadersInit }, attr) };
      }
    } catch { /* fall through untagged */ }
    return origFetch(input as any, init as any);
  }) as typeof fetch;
  (wrapped as any).__attributionWrapped = true;
  globalThis.fetch = wrapped;
});
