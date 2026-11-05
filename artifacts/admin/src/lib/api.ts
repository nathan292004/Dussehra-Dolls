import * as React from "react";

/** The shape every paginated admin list returns: ?page&pageSize → { items, total, page, pageSize, totalPages }. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Error carrying the server's message, code and traceId, so the UI can show something useful. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public traceId?: string) {
    super(message);
  }
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body.error || `Request failed (${res.status})`;
    throw new ApiError(body.traceId ? `${message} (ref ${body.traceId})` : message, res.status, body.code, body.traceId);
  }
  return body as T;
}

/** Builds "?a=1&b=x", leaving out empty / "all" values. */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
