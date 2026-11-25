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
  /** GAP-06: comma allowlist, e.g. "toss,stripe" (first = default). Unset = payments disabled. "sandbox" is refused outside development/test. */
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
  /** GAP-09: Solapi SMS/Alimtalk. Key + secret + sender(all three) gate SMS; KAKAO_PFID gates Alimtalk. Unset = rows stay queued. */
  SOLAPI_API_KEY?: string;
  SOLAPI_API_SECRET?: string;
  /** Registered sender number for SMS/LMS (e.g. "01012345678"). */
  SOLAPI_SENDER?: string;
  /** Solapi base override (tests/stubs). Default https://api.solapi.com. */
  SOLAPI_API_BASE?: string;
  /** Kakao channel sender key (pfId) for Alimtalk. */
  SOLAPI_KAKAO_PFID?: string;
  /** JSON map of our template name → approved Alimtalk template id. Missing = SMS fallback. */
  SOLAPI_KAKAO_TEMPLATES?: string;
  /** Verified sender identity, e.g. "getfortrip <noreply@getfortrip.com>". */
  EMAIL_FROM?: string;
  /** Sentry DSN for unhandled-error reporting. Unset = reporting disabled (silent no-op). */
  SENTRY_DSN?: string;
  /** Release tag (git sha) stamped on Sentry events. Unset = events carry no release. */
  SENTRY_RELEASE?: string;
  /** Database dialect: "pg" on the TG-09 harness, unset (= D1) everywhere else. */
  DB_DIALECT?: string;
  /** Injected ephemeral store (harness). Unset = D1-backed default. */
  EPHEMERAL?: import("./lib/ephemeral.ts").EphemeralStore;
  /** PBKDF2 iteration override (default 100000, clamped 10000–1000000). */
  PBKDF2_ITERATIONS?: string;
  /** NTS business-status API key (data.go.kr). Unset = API verification unavailable, manual review only. */
  NTS_API_KEY?: string;
  /** Contract-test stub base URL for the NTS client. Honored in development/test only. */
  NTS_API_BASE?: string;
  /**
   * Comma-separated hostnames the URL-ingestion fetcher may scrape even when
   * they look private (E2E fixture server on 127.0.0.1). Honored in
   * development/test only; production ignores it entirely (fail-closed).
   * Never set this in wrangler.jsonc.
   */
  INGEST_ALLOW_HOSTS?: string;
  /** CR-06 social login. A provider is offered only when its client id (and secret where required) is set. */
  OAUTH_KAKAO_CLIENT_ID?: string;
  /** Optional for Kakao (required only if "client secret" is enabled in the Kakao console). */
  OAUTH_KAKAO_CLIENT_SECRET?: string;
  OAUTH_GOOGLE_CLIENT_ID?: string;
  OAUTH_GOOGLE_CLIENT_SECRET?: string;
  OAUTH_NAVER_CLIENT_ID?: string;
  OAUTH_NAVER_CLIENT_SECRET?: string;
  /** Public origin that serves /api/v1 (callback host registered at each provider). Unset = request origin. */
  OAUTH_REDIRECT_BASE?: string;
  /** Contract-test stub replacing every provider host. Honored in development/test only. */
  OAUTH_STUB_BASE?: string;
  /** TG-13: OTLP/HTTP collector base (e.g. https://otel-collector:4318 — /v1/traces is appended). Unset = traces stay in the local ring buffer only. */
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  /** TG-13: service.name resource attribute. Defaults to "ota-hub". */
  OTEL_SERVICE_NAME?: string;
  /** TG-15: Cloudflare API token scoped to Cache Purge (worker secret). Unset = purge is an honest no-op. */
  CACHE_PURGE_TOKEN?: string;
  /** TG-15: zone id for purge_cache calls. Unset = purge is an honest no-op. */
  CLOUDFLARE_ZONE_ID?: string;
  /** TG-17: Stripe secret key (sk_test_/sk_live_). Unset = stripe provider unavailable. */
  STRIPE_SECRET_KEY?: string;
  /** TG-17: Stripe publishable key (public, served via /payments/config). */
  STRIPE_PUBLISHABLE_KEY?: string;
  /** TG-17: Stripe webhook signing secret (whsec_). Unset in production = webhooks rejected. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Contract-test stub base URL for the Stripe provider. Honored in development/test only. */
  STRIPE_API_BASE?: string;
  /** TG-17: "1" enforces fraud review holds. Unset = scoring off (suite + sandbox run unflagged). */
  FRAUD_REVIEW?: string;
  /** TG-18: NDC direct-connect API base (airline gateway). Loopback stub bases honored in development/test only. */
  NDC_API_BASE?: string;
  /** TG-18: NDC API key/secret. Unset = ndc adapter unconfigured (honest FAILED, unsellable). */
  NDC_API_KEY?: string;
  /** TG-18: GDS API base (aggregator gateway). Loopback stub bases honored in development/test only. */
  GDS_API_BASE?: string;
  /** TG-18: GDS API key/secret. Unset = gds adapter unconfigured (honest FAILED, unsellable). */
  GDS_API_KEY?: string;
  /** Phase 2 wholesale connectors: base + key per vendor. Unset = that vendor unsellable (fail-closed). */
  WHOLESALE_ROAMIFY_API_BASE?: string;
  WHOLESALE_ROAMIFY_API_KEY?: string;
  WHOLESALE_REDTEAGO_API_BASE?: string;
  WHOLESALE_REDTEAGO_API_KEY?: string;
  WHOLESALE_AIRALO_API_BASE?: string;
  WHOLESALE_AIRALO_API_KEY?: string;
  WHOLESALE_TIQETS_API_BASE?: string;
  WHOLESALE_TIQETS_API_KEY?: string;
  WHOLESALE_BEMY_GUEST_API_BASE?: string;
  WHOLESALE_BEMY_GUEST_API_KEY?: string;
  WHOLESALE_KLOOK_API_BASE?: string;
  WHOLESALE_KLOOK_API_KEY?: string;
  WHOLESALE_KKDAY_API_BASE?: string;
  WHOLESALE_KKDAY_API_KEY?: string;
  /** TG-18: supplier circuit-breaker OPEN cooldown in ms (default 300000, clamped 1000–3600000). */
  SUPPLIER_BREAKER_COOLDOWN_MS?: string;
  /** TG-20: read-replica worker base URL (https, or loopback http in development/test only). Unset = all reads serve locally. */
  READ_REPLICA_URL?: string;
  /** P6: IndexNow API key (Bing/Yandex instant indexing). Unset = pumpIndexNow is an honest no-op. */
  INDEXNOW_KEY?: string;
  /** TG-20: replica lag ceiling in ms (default 5000, clamped 100–60000). Above it reads fall back to primary. */
  REPLICA_MAX_LAG_MS?: string;
  /** TG-20: operator-declared primary region code (e.g. "ICN"). Surfaced on /status; no routing behavior in v1. */
  PRIMARY_REGION?: string;
  /** S5: public company facts for llms-full.txt. Unset = the lines are omitted (pre-registration). */
  COMPANY_NAME?: string;
  COMPANY_CEO?: string;
  COMPANY_ADDRESS?: string;
  COMPANY_BIZ_NO?: string;
  /**
   * TG-21: Workers AI binding (optional). The real Ai binding satisfies
   * this structural shape; absent = rule fallbacks everywhere (local dev
   * and tests run without it — no key, no account needed).
   */
  AI?: {
    run(model: string, inputs: unknown, options?: unknown): Promise<any>;
  };
}

export function isNonProduction(env: Env): boolean {
  return env.APP_ENV === "development" || env.APP_ENV === "test";
}

export function flag(env: Env, name: "ALLOW_SIMULATED_SUPPLIERS" | "ALLOW_DRAFT_ENTITY"): boolean {
  return isNonProduction(env) && env[name] === "true";
}
