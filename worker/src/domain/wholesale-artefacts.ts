/**
 * Wholesale artefact codec (pure: issue() stays the single DB writer).
 *
 * Suppliers return typed artefact strings — `esim:lpa:…`, `esim:qr:…`,
 * `voucher:code:…`, `voucher:barcode:…`, `voucher:pdf:<https-url>` — which
 * this module builds (encode, at the adapter) and parses (decode, at the
 * booking API / email / /my/bookings). One module owns both directions so
 * they can never drift. Unknown prefixes and empty values are rejected
 * (null), never displayed: a malformed supplier answer parks for review.
 */

export interface WholesaleArtefacts {
  lpa: string | null;
  qr: string | null;
  codes: string[];
  barcodes: string[];
  pdfUrls: string[];
  raw: string[];
}

/** Non-empty trimmed string, or null. Local: this module stays dependency-free. */
function text(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/** Supplier voucher rows -> typed artefact strings, or null when malformed. */
export function voucherArtefacts(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 20) return null;
  const out: string[] = [];
  for (const row of v) {
    const code = text((row as any)?.code);
    if (!code) return null;
    out.push(`voucher:code:${code}`);
    const barcode = text((row as any)?.barcode);
    if (barcode) out.push(`voucher:barcode:${barcode}`);
    const pdf = text((row as any)?.pdfUrl);
    if (pdf) {
      if (!pdf.startsWith("https://")) return null;
      out.push(`voucher:pdf:${pdf}`);
    }
  }
  return out;
}

const PREFIXES = ["esim:lpa:", "esim:qr:", "voucher:code:", "voucher:barcode:", "voucher:pdf:"] as const;

function split(entry: unknown): [string, string] | null {
  if (typeof entry !== "string") return null;
  const p = PREFIXES.find((x) => entry.startsWith(x));
  if (!p) return null;
  const value = entry.slice(p.length).trim();
  if (!value) return null;
  if (p === "voucher:pdf:" && !value.startsWith("https://")) return null;
  return [p, value];
}

/** Validated parse, or null when any entry is unknown/malformed/empty. */
export function tryParseWholesaleArtefacts(list: unknown): WholesaleArtefacts | null {
  if (!Array.isArray(list) || list.length === 0 || list.length > 20) return null;
  const out: WholesaleArtefacts = { lpa: null, qr: null, codes: [], barcodes: [], pdfUrls: [], raw: [] };
  for (const e of list) {
    const s = split(e);
    if (!s) return null;
    const [p, v] = s;
    out.raw.push(`${p}${v}`);
    if (p === "esim:lpa:") out.lpa = out.lpa ?? v;
    else if (p === "esim:qr:") out.qr = out.qr ?? v;
    else if (p === "voucher:code:") out.codes.push(v);
    else if (p === "voucher:barcode:") out.barcodes.push(v);
    else out.pdfUrls.push(v);
  }
  return out;
}
