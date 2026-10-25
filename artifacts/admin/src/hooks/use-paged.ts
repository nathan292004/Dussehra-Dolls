import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

/** What every admin list endpoint returns. */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const EMPTY_PAGE: Paged<never> = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };

/** Waits until the value has stopped changing, so typing in a search box does not send a request per key. */
export function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface Options {
  /** Extra filters, e.g. { status: "paid" }. Empty values and "all" are left out. */
  params?: Record<string, string | number | undefined | null>;
  pageSize?: number;
  refetchInterval?: number;
}

/**
 * Loads one page of an admin list from the server (search + filters + page number all go to the server).
 * Going back to page 1 happens by itself whenever the search or a filter changes.
 */
export function usePaged<T>(path: string, { params = {}, pageSize = 25, refetchInterval }: Options = {}) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search.trim());

  const filterKey = JSON.stringify(params);
  React.useEffect(() => setPage(1), [q, filterKey, pageSize]);

  const query = useQuery<Paged<T>>({
    queryKey: [path, { page, pageSize, q, params }],
    queryFn: async () => {
      const url = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) url.set("q", q);
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "" && v !== "all") url.set(k, String(v));
      }
      const res = await fetch(`${path}?${url}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not load the list");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchInterval,
  });

  const data = query.data ?? (EMPTY_PAGE as Paged<T>);
  // If the last row of the last page was removed, step back to the new last page.
  React.useEffect(() => {
    if (query.data && page > query.data.totalPages) setPage(query.data.totalPages);
  }, [query.data, page]);

  return { ...query, data, items: data.items, page, setPage, search, setSearch, pageSize };
}
