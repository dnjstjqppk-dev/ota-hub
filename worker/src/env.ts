export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** "production" | "staging" | "development" | "test". Anything other than development/test is treated as production. */
  APP_ENV?: string;
  JWT_SECRET?: string;
  /** 32-byte base64 key for AES-GCM encryption of passport numbers. */
  PII_ENC_KEY?: string;
  ALLOWED_ORIGINS?: string;
  PUBLIC_SITE_URL?: string;
  /** "toss" | "sandbox" | unset. Unset = payments disabled. "sandbox" is refused outside development/test. */
  PAYMENT_PROVIDER?: string;
  TOSS_SECRET_KEY?: string;
  TOSS_CLIENT_KEY?: string;
  /** Shared secret used to sign sandbox payment webhooks in tests. */
  SANDBOX_WEBHOOK_SECRET?: string;
  /** "true" allows suppliers with adapter=simulator to fulfil bookings. Refused outside development/test. */
  ALLOW_SIMULATED_SUPPLIERS?: string;
  /** "true" lets development run with a DRAFT business entity. Refused outside development/test. */
  ALLOW_DRAFT_ENTITY?: string;
}

export function isNonProduction(env: Env): boolean {
  return env.APP_ENV === "development" || env.APP_ENV === "test";
}

export function flag(env: Env, name: "ALLOW_SIMULATED_SUPPLIERS" | "ALLOW_DRAFT_ENTITY"): boolean {
  return isNonProduction(env) && env[name] === "true";
}
