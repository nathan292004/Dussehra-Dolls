import { ChevronLeft, ChevronRight } from "lucide-react";

/** "Showing 26–50 of 112" with Previous / Next. Hidden when there is nothing to show. */
export function Pager({
  page,
  pageSize,
  total,
  totalPages,
  onPage,
  busy,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-warm-border text-sm bg-white hover:bg-parchment disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-warm-border text-sm text-warm-secondary">
      <span>
        Showing {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
        {busy ? " · updating…" : ""}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
