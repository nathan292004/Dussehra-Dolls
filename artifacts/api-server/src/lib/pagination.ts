import type { Request } from "express";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  page: number;
  pageSize: number;
  offset: number;
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
}

/** Reads ?page=1&pageSize=25 from the query string. Bad or missing values fall back to safe defaults. */
export function readPage(req: Request, defaultSize = DEFAULT_PAGE_SIZE): PageRequest {
  const page = positiveInt(req.query.page) ?? 1;
  const pageSize = Math.min(positiveInt(req.query.pageSize) ?? defaultSize, MAX_PAGE_SIZE);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageOf<T>(items: T[], total: number, p: PageRequest) {
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Text from a query parameter, trimmed and capped; empty when missing. */
export function readSearch(req: Request, key = "q", max = 80): string {
  const v = req.query[key];
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Escapes % and _ so a search term is matched literally inside ILIKE. */
export const likePattern = (term: string) => `%${term.replace(/[\%_]/g, (c) => "\\" + c)}%`;
