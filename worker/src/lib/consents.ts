import { HttpError, str } from "./http.ts";
import { newId } from "./crypto.ts";

/**
 * Consent audit trail (A2/A3/A4). Every grant AND withdrawal is appended,
 * never updated: who consented to what version, when, from where.
 * Versions always come from legal_documents — the UI can never invent one.
 */
export const CONSENT_TYPES = ["TERMS", "PRIVACY", "REFUND_POLICY", "THIRD_PARTY_SUPPLIER", "MARKETING"] as const;

export async function currentVersions(db: D1Database): Promise<Record<string, string>> {
  const rows = await db.prepare("SELECT slug, version FROM legal_documents").all<{ slug: string; version: string }>();
  const out: Record<string, string> = {};
  for (const r of rows.results || []) out[r.slug] = r.version;
  return out;
}

export interface ConsentGrant {
  type: string;
  version: string;
  agreed: boolean;
  target?: string | null;
}

export function consentStmts(
  db: D1Database,
  userId: string,
  grants: ConsentGrant[],
  ip: string | null,
  userAgent: string | null,
): D1PreparedStatement[] {
  return grants.map((g) =>
    db.prepare("INSERT INTO user_consents (id, user_id, consent_type, version, agreed, target, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("cns"), userId, g.type, str(g.version, 20), g.agreed ? 1 : 0, g.target ? str(g.target, 100) : null, ip ? str(ip, 60) : null, userAgent ? str(userAgent, 300) : null),
  );
}

export interface TxConsents {
  refundPolicy: string;
  privacy: string;
  thirdParty: string;
}

/** Validate the three mandatory transaction consents (A3). Throws; records nothing. */
export function validateTxConsents(body: any, versions: Record<string, string>): TxConsents {
  const c = body?.consents;
  if (!c || typeof c !== "object") throw new HttpError(400, "CONSENT_REQUIRED", "취소·환불 규정, 개인정보 수집·이용, 제3자 제공에 모두 동의해야 예약할 수 있습니다.");
  const rp = str(c.refundPolicy?.version ?? c.refundPolicy, 20);
  const pv = str(c.privacy?.version ?? c.privacy, 20);
  const tp = str(c.thirdParty?.version ?? c.thirdParty, 20);
  if (!rp || !pv || !tp) throw new HttpError(400, "CONSENT_REQUIRED", "취소·환불 규정, 개인정보 수집·이용, 제3자 제공에 모두 동의해야 예약할 수 있습니다.");
  if (rp !== versions["refund-policy"] || pv !== versions["privacy"] || tp !== versions["privacy"]) {
    throw new HttpError(400, "CONSENT_STALE", "약관이 변경되었습니다. 최신 약관을 확인하고 다시 동의해주세요.", { current: { refundPolicy: versions["refund-policy"], privacy: versions["privacy"] } });
  }
  return { refundPolicy: rp, privacy: pv, thirdParty: tp };
}
