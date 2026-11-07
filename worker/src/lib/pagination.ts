/** Shared list pagination: ?page=1-based + ?pageSize= (legacy ?limit= honored). */
export interface Page {
  page: number;
  pageSize: number;
  offset: number;
}

export function pageParams(url: URL, defaultSize = 20, maxSize = 200): Page {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const raw = url.searchParams.get("pageSize") || url.searchParams.get("limit") || String(defaultSize);
  const pageSize = Math.max(1, Math.min(maxSize, parseInt(raw, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageMeta(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
