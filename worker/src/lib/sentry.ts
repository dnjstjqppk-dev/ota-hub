import type { Env } from "../env.ts";

/**
 * Minimal Sentry error reporter (zero dependencies).
 *
 * Speaks the Sentry envelope protocol directly so the edge worker and the
 * three portals share one observable contract without SDK weight:
 *   POST {protocol}://{host}/api/{projectId}/envelope/
 * Disabled (silent no-op) unless a DSN is configured. Never throws and never
 * sends PII: emails and secret-looking query params are scrubbed.
 */

export interface ParsedDsn {
  protocol: string;
  host: string;
  projectId: string;
  publicKey: string;
}

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.username) return null;
    const projectId = u.pathname.split("/").filter(Boolean).pop();
    if (!projectId || !/^\d+$/.test(projectId)) return null;
    return { protocol: u.protocol.replace(/:$/, ""), host: u.host, projectId, publicKey: u.username };
  } catch {
    return null;
  }
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_QUERY_RE = /([?&](token|key|secret|password|passwd|auth|authorization|signature|sig|code|session)=)[^&#\s]*/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9\-._~+/=]+/gi;
const KR_PHONE_RE = /\b01[016789]-?\d{3,4}-?\d{4}\b/g;
const KR_RRN_RE = /\b\d{6}-\d{7}\b/g;

export function scrubPII(text: string): string {
  return String(text)
    .replace(EMAIL_RE, "[email]")
    .replace(SECRET_QUERY_RE, "$1[redacted]")
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(KR_PHONE_RE, "[phone]")
    .replace(KR_RRN_RE, "[rrn]");
}

interface StackFrame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

/** Parse V8 stack lines into Sentry frames (oldest call first). Unknown lines are dropped. */
export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of String(stack).split("\n").slice(0, 30)) {
    const m = /^\s*at\s+(?:(.*?)\s+\()?([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (!m) continue;
    frames.push({
      function: m[1] || "<anonymous>",
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
    });
  }
  return frames.reverse();
}

export interface SentryContext {
  url?: string;
  method?: string;
  environment?: string;
  release?: string;
}

export function eventId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return Math.floor(Date.now() * Math.random()).toString(16).padStart(32, "0").slice(0, 32);
  }
}

export function buildEvent(err: unknown, ctx: SentryContext = {}): Record<string, unknown> {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
  const event: Record<string, unknown> = {
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    level: "error",
    platform: "javascript",
    environment: ctx.environment || "production",
    ...(ctx.release ? { release: ctx.release } : {}),
    exception: {
      values: [
        {
          type: e.name || "Error",
          value: scrubPII(e.message || String(err)).slice(0, 2000),
          ...(e.stack ? { stacktrace: { frames: parseStack(e.stack) } } : {}),
        },
      ],
    },
  };
  if (ctx.url || ctx.method) {
    event.request = {
      ...(ctx.url ? { url: scrubPII(ctx.url).slice(0, 500) } : {}),
      ...(ctx.method ? { method: ctx.method } : {}),
    };
  }
  return event;
}

export interface EnvelopeRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const CLIENT_NAME = "getfortrip-sentry/1.0";

export function buildEnvelope(dsn: string, event: Record<string, unknown>): EnvelopeRequest | null {
  const p = parseDsn(dsn);
  if (!p) return null;
  const header = { event_id: event.event_id, sent_at: new Date().toISOString(), sdk: { name: CLIENT_NAME, version: "1.0" } };
  const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
  return {
    url: `${p.protocol}://${p.host}/api/${p.projectId}/envelope/`,
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=${CLIENT_NAME}, sentry_key=${p.publicKey}`,
    },
    body,
  };
}

type WaitUntil = { waitUntil(p: Promise<unknown>): void } | null | undefined;
type FetchFn = (url: string, init: Record<string, unknown>) => Promise<unknown>;

/**
 * Report an unhandled error to Sentry. Returns false (no network) when no
 * valid DSN is configured. Never throws: reporting must not break serving.
 */
export function captureException(
  env: Env,
  ctx: WaitUntil,
  err: unknown,
  extra: SentryContext = {},
  transport?: FetchFn,
): boolean {
  try {
    const dsn = (env.SENTRY_DSN || "").trim();
    if (!dsn) return false;
    const event = buildEvent(err, {
      environment: env.APP_ENV && env.APP_ENV !== "" ? env.APP_ENV : "production",
      release: (env.SENTRY_RELEASE || "").trim() || undefined,
      ...extra,
    });
    const req = buildEnvelope(dsn, event);
    if (!req) return false;
    const send = (transport || fetch)(req.url, { method: "POST", headers: req.headers, body: req.body })
      .then(() => undefined, () => undefined);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(send);
    else void send;
    return true;
  } catch {
    return false;
  }
}
