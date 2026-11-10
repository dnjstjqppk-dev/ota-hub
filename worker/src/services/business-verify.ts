/**
 * Business registration verification (C2) via the NTS status API
 * (data.go.kr B552015/NtsBusinessmanInfoService). Only a "01 계속사업자"
 * (operating) status counts as verified. Without NTS_API_KEY the API path
 * is unavailable and admins must record a MANUAL check instead — the
 * approval gate accepts either, but never an unchecked number.
 */
import type { Env } from "../env.ts";
import { isNonProduction } from "../env.ts";
import { HttpError } from "../lib/http.ts";

export interface BusinessCheck {
  valid: boolean;
  status: string;
  statusCode: string;
  raw: unknown;
}

export function normalizeBizNo(v: unknown): string {
  return String(v || "").replace(/\D/g, "");
}

export async function verifyBusinessNumber(env: Env, bizNo: string): Promise<BusinessCheck> {
  const digits = normalizeBizNo(bizNo);
  if (!/^\d{10}$/.test(digits)) throw new HttpError(400, "INVALID_BIZ_NO", "사업자등록번호는 숫자 10자리여야 합니다.");
  const key = (env.NTS_API_KEY || "").trim();
  if (!key) throw new HttpError(503, "NTS_NOT_CONFIGURED", "사업자 진위확인 API 키가 설정되지 않았습니다. 수동 확인으로 진행해주세요.");
  const base = (isNonProduction(env) ? (env.NTS_API_BASE || "").trim() : "") || "https://apis.data.go.kr/B552015/NtsBusinessmanInfoService";
  let res: Response;
  try {
    res = await fetch(`${base}/getValidation?serviceKey=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [digits] }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "NTS_LOOKUP_FAILED", "사업자 진위확인 서비스에 연결할 수 없습니다.");
  }
  if (!res.ok) throw new HttpError(502, "NTS_LOOKUP_FAILED", `사업자 진위확인 서비스 오류 (HTTP_${res.status})`);
  const body = await res.json().catch(() => ({}));
  const row = Array.isArray((body as any)?.data) ? (body as any).data[0] : null;
  const code = String(row?.b_stt_cd || "");
  const status = String(row?.b_stt || "");
  if (!row || !code) throw new HttpError(502, "NTS_LOOKUP_FAILED", "사업자 진위확인 응답을 해석할 수 없습니다.");
  return { valid: code === "01", status, statusCode: code, raw: row };
}
