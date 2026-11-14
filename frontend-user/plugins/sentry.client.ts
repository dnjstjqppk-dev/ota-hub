// Minimal Sentry error reporter for the User portal (no dependencies).
// Client-only: hooks Vue errors + window errors and POSTs a Sentry envelope.
// No-op unless NUXT_PUBLIC_SENTRY_DSN is set at build time. Never throws;
// PII (emails, secret query params) is scrubbed before sending.

interface ParsedDsn {
  protocol: string
  host: string
  projectId: string
  publicKey: string
}

function parseDsn(dsn: string): ParsedDsn | null {
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

function scrubPII(text: string): string {
  return String(text).replace(EMAIL_RE, '[email]').replace(SECRET_QUERY_RE, '$1[redacted]')
}

interface StackFrame {
  function?: string
  filename?: string
  lineno?: number
  colno?: number
}

function parseStack(stack: string): StackFrame[] {
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

export default defineNuxtPlugin((nuxtApp) => {
  const dsn = ((useRuntimeConfig().public as Record<string, unknown>).sentryDsn as string) || ''
  const parsed = parseDsn(dsn)
  if (!parsed) return
  const environment = (useRuntimeConfig().public as Record<string, unknown>).sentryEnv as string || 'production'
  const release = (useRuntimeConfig().public as Record<string, unknown>).sentryRelease as string || ''

  const send = (err: unknown) => {
    try {
      const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error')
      const event: Record<string, unknown> = {
        event_id: eventId(),
        timestamp: Date.now() / 1000,
        level: 'error',
        platform: 'javascript',
        environment,
        ...(release ? { release } : {}),
        exception: {
          values: [
            {
              type: e.name || 'Error',
              value: scrubPII(e.message || String(err)).slice(0, 2000),
              ...(e.stack ? { stacktrace: { frames: parseStack(e.stack) } } : {}),
            },
          ],
        },
        request: { url: scrubPII(window.location.href).slice(0, 500) },
      }
      const header = { event_id: event.event_id, sent_at: new Date().toISOString(), sdk: { name: CLIENT_NAME, version: '1.0' } }
      const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`
      void fetch(`${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=${CLIENT_NAME}, sentry_key=${parsed.publicKey}`,
        },
        body,
        keepalive: true,
      }).catch(() => undefined)
    } catch {
      /* reporting must never break the app */
    }
  }

  nuxtApp.vueApp.config.errorHandler = (err) => send(err)
  window.addEventListener('error', (ev) => send(ev.error || ev.message))
  window.addEventListener('unhandledrejection', (ev) => send(ev.reason))
})
