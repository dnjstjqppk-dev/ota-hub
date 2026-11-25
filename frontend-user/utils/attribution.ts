/**
 * S10: first-touch attribution helpers (pure; the client plugin wires them to
 * sessionStorage + fetch). The tab's landing referrer/utm is captured once and
 * forwarded on same-origin /api/* calls so the hub can classify traffic sources.
 */

export interface LandingAttribution {
  sid: string;
  ref: string;
  utm: string;
}

/** Parse landing signals from a location search string + document.referrer. */
export function parseLandingAttribution(search: string, referrer: string): { ref: string; utm: string } {
  let utm = '';
  try {
    const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    utm = ['utm_source', 'utm_medium', 'utm_campaign']
      .map((k) => (q.get(k) ? `${k}=${q.get(k)}` : ''))
      .filter(Boolean)
      .join('&');
  } catch { utm = ''; }
  return { ref: (referrer || '').slice(0, 512), utm: utm.slice(0, 512) };
}

/** Attribution headers ride same-origin /api/* calls only — never third parties. */
export function shouldTagRequest(input: unknown, origin: string): boolean {
  if (typeof input !== 'string') return false;
  try {
    const u = new URL(input, origin);
    return u.origin === origin && u.pathname.startsWith('/api/');
  } catch { return false; }
}

/** Merge attribution headers without disturbing existing ones (any HeadersInit shape). */
export function withAttributionHeaders(
  init: { headers?: HeadersInit } | undefined,
  attr: LandingAttribution,
): Record<string, string> {
  const merged: Record<string, string> = {};
  const src = init?.headers;
  if (src) {
    if (typeof Headers !== 'undefined' && src instanceof Headers) src.forEach((v, k) => { merged[k] = v; });
    else if (Array.isArray(src)) for (const [k, v] of src) merged[k] = v;
    else Object.assign(merged, src);
  }
  merged['X-Session-Id'] = attr.sid;
  merged['X-Landing-Ref'] = attr.ref;
  merged['X-Landing-Utm'] = attr.utm;
  return merged;
}
