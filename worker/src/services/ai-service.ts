import type { Env } from "../env.ts";

/**
 * TG-21: Workers AI text generation with a rule fallback.
 *
 * The binding is optional: local dev, tests, and unconfigured production
 * run the rule fallbacks (callers own them). When bound, every output is
 * scrubbed before display — PII patterns masked, blocklist terms dropped.
 * Generation never throws: failures resolve to { text: null } and the
 * caller falls back. A 10s race keeps slow inference off the hot path.
 */

export const AI_TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const AI_TIMEOUT_MS = 10_000;

export interface AiTextRunner {
  run(model: string, inputs: unknown, options?: unknown): Promise<any>;
}

/**
 * Minimal blocklist seed (v1). UNAMBIGUOUS severe terms only — anything
 * with benign uses stays out (false positives are worse than gaps here).
 * Production needs a native-speaker-reviewed list (TG-21 residual).
 */
const BLOCKLIST = [
  "씨발", "시발", "병신", "지랄", "개새끼", "미친놈", "미친년",
  "fuck", "shit",
];

export function scrubPii(text: string): string {
  let out = String(text || "");
  // Emails.
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일]");
  // Resident numbers BEFORE phones: 900101-1234567 partially matches the
  // phone shape and would shred first.
  out = out.replace(/\b\d{6}[-\s]?\d{7}\b/g, "[주민번호]");
  // Passport numbers (M12345678).
  out = out.replace(/\b[A-Z]\d{7,8}\b/g, "[여권번호]");
  // Korean mobile / landline shapes (010-1234-5678, 02-123-4567, +82...).
  out = out.replace(/(\+82[-\s]?)?0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g, "[연락처]");
  // Long digit runs that smell like account/card numbers (12+ digits).
  out = out.replace(/\b\d{12,19}\b/g, "[번호]");
  return out;
}

export function scrubBlocked(text: string): string {
  let out = String(text || "");
  for (const w of BLOCKLIST) {
    out = out.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "■■");
  }
  return out;
}

/** Full output filter: PII first, then the blocklist. */
export function scrubOutput(text: string): string {
  return scrubBlocked(scrubPii(text)).slice(0, 2000);
}

export async function generateText(
  env: Env,
  input: { system: string; user: string; maxTokens?: number },
  runner?: AiTextRunner,
): Promise<{ text: string | null; source: "ai" | "unavailable" | "error" }> {
  const ai: AiTextRunner | undefined = runner || env.AI;
  if (!ai) return { text: null, source: "unavailable" };
  try {
    const raced = await Promise.race([
      ai.run(AI_TEXT_MODEL, {
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        max_tokens: input.maxTokens ?? 300,
      }),
      new Promise<null>((res) => setTimeout(() => res(null), AI_TIMEOUT_MS)),
    ]);
    const text = typeof (raced as any)?.response === "string" ? (raced as any).response.trim() : "";
    if (!text) return { text: null, source: "error" };
    return { text: scrubOutput(text), source: "ai" };
  } catch {
    return { text: null, source: "error" };
  }
}
