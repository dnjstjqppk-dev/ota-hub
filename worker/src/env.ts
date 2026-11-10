export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** R2 bucket for partner docs and product images (C1). */
  UPLOADS?: R2Bucket;
  /** "production" | "staging" | "development" | "test". Anything other than development/test is treated as production. */
  APP_ENV?: string;
  JWT_SECRET?: string;
  /** 32-byte base64 key for AES-GCM encryption of passport numbers. */
  PII_ENC_KEY?: string;
  ALLOWED_ORIGINS?: string;
  PUBLIC_SITE_URL?: string;
  PARTNER_SITE_URL?: string;
  /** "toss" | "sandbox" | unset. Unset = payments disabled. "sandbox" is refused outside development/test. */
  PAYMENT_PROVIDER?: string;
  TOSS_SECRET_KEY?: string;
  TOSS_CLIENT_KEY?: string;
  TOSS_WEBHOOK_SECRET?: string;
  OUTBOX_BATCH_LIMIT?: string;
  /** Contract-test stub base URL for the Toss provider. Honored in development/test only; production always uses api.tosspayments.com. */
  TOSS_API_BASE?: string;
  /** "true" allows suppliers with adapter=simulator to fulfil bookings. Refused outside development/test. */
  ALLOW_SIMULATED_SUPPLIERS?: string;
  /** "true" lets development run with a DRAFT business entity. Refused outside development/test. */
  ALLOW_DRAFT_ENTITY?: string;
  /** Resend API key for transactional email. Unset = emails stay queued, API says NOT_CONFIGURED. */
  RESEND_API_KEY?: string;
  /** Verified sender identity, e.g. "getfortrip <noreply@getfortrip.com>". */
  EMAIL_FROM?: string;
  /** Sentry DSN for unhandled-error reporting. Unset = reporting disabled (silent no-op). */
  SENTRY_DSN?: string;
  /** PBKDF2 iteration override (default 100000, clamped 10000–1000000). */
  PBKDF2_ITERATIONS?: string;
  /** NTS business-status API key (data.go.kr). Unset = API verification unavailable, manual review only. */
  NTS_API_KEY?: string;
  /** Contract-test stub base URL for the NTS client. Honored in development/test only. */
  NTS_API_BASE?: string;
}

export function isNonProduction(env: Env): boolean {
  return env.APP_ENV === "development" || env.APP_ENV === "test";
}

export function flag(env: Env, name: "ALLOW_SIMULATED_SUPPLIERS" | "ALLOW_DRAFT_ENTITY"): boolean {
  return isNonProduction(env) && env[name] === "true";
}
