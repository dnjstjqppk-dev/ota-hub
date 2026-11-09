// Minimal Sentry error reporter for the Partner Extranet (no dependencies).
// Hooks Vue errors + window errors and POSTs a Sentry envelope. No-op unless
// a DSN is passed (VITE_SENTRY_DSN at build time). Never throws; PII scrubbed.

export interface ParsedDsn {
  protocol: string
  host: string
  projectId: string
  publicKey: string
}

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.username) return null
    const projectId = u.pathname.split('/').filter(Boolean).pop()
    if (!projectId || !/^\d+$/.test(projectId)) return null
    return { protocol: u.protocol.replace(/:$/, ''), host: u.host, projectId, publicKey: u.username }
  } catch {
    return null
  }
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const SECRET_QUERY_RE = /([?&](token|key|secret|password|passwd|auth|authorization|signature|sig|code|session)=)[^&#\s]*/gi

export function scrubPII(text: string): string {
  return String(text).replace(EMAIL_RE, '[email]').replace(SECRET_QUERY_RE, '$1[redacted]')
}

interface StackFrame {
  function?: string
  filename?: string
  lineno?: number
  colno?: number
}

export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = []
  for (const line of String(stack).split('\n').slice(0, 30)) {
    const m = /^\s*at\s+(?:(.*?)\s+\()?([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line.trim())
    if (!m) continue
    frames.push({ function: m[1] || '<anonymous>', filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) })
  }
  return frames.reverse()
}

function eventId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return Math.floor(Date.now() * Math.random()).toString(16).padStart(32, '0').slice(0, 32)
  }
}

const CLIENT_NAME = 'getfortrip-sentry/1.0'

export interface EnvelopeRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export function buildEnvelope(dsn: string, err: unknown, extra: { url?: string; environment?: string }): EnvelopeRequest | null {
  const p = parseDsn(dsn)
  if (!p) return null
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error')
  const event: Record<string, unknown> = {
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    level: 'error',
    platform: 'javascript',
    environment: extra.environment || 'production',
    exception: {
      values: [
        {
          type: e.name || 'Error',
          value: scrubPII(e.message || String(err)).slice(0, 2000),
          ...(e.stack ? { stacktrace: { frames: parseStack(e.stack) } } : {}),
        },
      ],
    },
  }
  if (extra.url) event.request = { url: scrubPII(extra.url).slice(0, 500) }
  const header = { event_id: event.event_id, sent_at: new Date().toISOString(), sdk: { name: CLIENT_NAME, version: '1.0' } }
  return {
    url: `${p.protocol}://${p.host}/api/${p.projectId}/envelope/`,
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=${CLIENT_NAME}, sentry_key=${p.publicKey}`,
    },
    body: `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`,
  }
}

interface VueAppLike {
  config: { errorHandler?: ((err: unknown, instance: unknown, info: string) => void) | null }
}

export interface SentryOptions {
  dsn: string
  environment?: string
  transport?: (url: string, init: Record<string, unknown>) => Promise<unknown>
}

/** Install error hooks. Returns false (nothing installed) when the DSN is missing/invalid. */
export function initSentry(app: VueAppLike, opts: SentryOptions): boolean {
  try {
    const dsn = (opts.dsn || '').trim()
    if (!parseDsn(dsn)) return false
    if (typeof window === 'undefined') return false
    const environment = opts.environment || 'production'
    const send = (err: unknown) => {
      try {
        const req = buildEnvelope(dsn, err, { url: window.location.href, environment })
        if (!req) return
        const t = opts.transport || fetch
        void Promise.resolve(t(req.url, { method: 'POST', headers: req.headers, body: req.body, keepalive: true })).catch(() => undefined)
      } catch {
        /* reporting must never break the app */
      }
    }
    app.config.errorHandler = (err) => send(err)
    window.addEventListener('error', (ev) => send((ev as ErrorEvent).error || (ev as ErrorEvent).message))
    window.addEventListener('unhandledrejection', (ev) => send((ev as PromiseRejectionEvent).reason))
    return true
  } catch {
    return false
  }
}
