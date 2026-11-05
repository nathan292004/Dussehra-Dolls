import { ChevronLeft, ChevronRight } from "lucide-react";

/** "Showing 26–50 of 132" with previous / next, under every paginated admin table. */
export function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  isFetching,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
}) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const btn = "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-warm-border text-xs font-medium text-ink bg-white hover:bg-parchment disabled:opacity-40 disabled:pointer-events-none";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-parchment text-xs text-warm-secondary">
      <span aria-live="polite">
        Showing {first}–{last} of {total}{isFetching ? " · updating…" : ""}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
