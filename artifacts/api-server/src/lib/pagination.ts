export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  isPaginatedRequest: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Parses query parameters for pagination.
 * Supports ?page=1&limit=20 or ?page=1&pageSize=20.
 */
export function parsePaginationParams(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 100): PaginationParams {
  const isPaginatedRequest = query.page !== undefined || query.limit !== undefined || query.pageSize !== undefined || query.paginate === "true";
  
  let page = parseInt(String(query.page || "1"), 10);
  if (!Number.isInteger(page) || page < 1) page = 1;

  let limit = parseInt(String(query.limit || query.pageSize || defaultLimit), 10);
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;

  return { page, limit, offset, isPaginatedRequest };
}

/**
 * Constructs standard pagination metadata.
 */
export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Helper to respond with either paginated JSON or backward-compatible array with pagination headers.
 */
export function formatListResponse<T>(res: any, items: T[], total: number, params: PaginationParams) {
  const meta = buildPaginationMeta(total, params.page, params.limit);

  res.setHeader("X-Total-Count", String(total));
  res.setHeader("X-Page", String(meta.page));
  res.setHeader("X-Page-Size", String(meta.limit));
  res.setHeader("X-Total-Pages", String(meta.totalPages));

  if (params.isPaginatedRequest) {
    return res.json({
      data: items,
      pagination: meta,
    });
  }

  return res.json(items);
}
