import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounced } from "@/hooks/use-paged";
import { Pager } from "@/components/pager";
import { formatIST } from "@/lib/time";
import { Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type PaymentStatus = "paid" | "pending" | "overdue" | "completed";

type Row = {
  id: number;
  name: string;
  chits: number;
  monthlyAmount: number;
  totalAmount: number;
  amountPaid: number;
  durationMonths: number;
  monthsPaid: number;
  outstanding: number;
  monthsPending: number;
  cycleLabel: string;
  paymentStatus: PaymentStatus;
  isPartiallyPaid: boolean;
  remindersSent: number;
  remindersFailed: number;
  lastReminderAt: string | null;
  customer: { userId: string; index: number; name: string; phone: string; isDeleted: boolean };
};

type Data = {
  stats: { totalSubscriptions: number; paid: number; pending: number; overdue: number; completed: number };
  plans: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE = 25;

const BADGE: Record<PaymentStatus, [string, string]> = {
  paid: ["bg-forest-light text-forest", "Paid up"],
  pending: ["bg-amber-100 text-amber-800", "Pending"],
  overdue: ["bg-danger-light text-destructive", "Overdue"],
  completed: ["bg-blue-100 text-blue-700", "Completed"],
};

export function ChitSubscriptions() {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<PaymentStatus | "all">("all");
  const [page, setPage] = React.useState(1);
  const q = useDebounced(search.trim());
  React.useEffect(() => setPage(1), [q, filter]);
  const { data, isLoading, isFetching } = useQuery<Data>({
    queryKey: ["/api/admin/chit-plans/subscriptions", { page, q, filter }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/admin/chit-plans/subscriptions?${params}`);
      if (!res.ok) throw new Error("Could not load the plans");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
  const stats = data?.stats ?? { totalSubscriptions: 0, paid: 0, pending: 0, overdue: 0, completed: 0 };
  const rows = data?.plans ?? [];

  const cards: { key: PaymentStatus | "all"; label: string; value: number; color: string }[] = [
    { key: "all", label: "Approved plans", value: stats.totalSubscriptions, color: "text-ink" },
    { key: "paid", label: "Paid up", value: stats.paid, color: "text-forest" },
    { key: "pending", label: "Pending", value: stats.pending, color: "text-amber-700" },
    { key: "overdue", label: "Overdue", value: stats.overdue, color: "text-destructive" },
    { key: "completed", label: "Completed", value: stats.completed, color: "text-blue-700" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Chit Subscriptions</h1>
        <p className="text-warm-secondary mt-1 text-sm">
          Approved chit plans and how each customer is paying. Plans waiting for approval are on the Chit Approvals page.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`text-left bg-white rounded-2xl border p-5 transition-colors ${filter === c.key ? "border-ink" : "border-warm-border hover:bg-parchment"}`}
          >
            <p className="text-xs text-warm-muted uppercase tracking-wider">{c.label}</p>
            <p className={`text-3xl font-display mt-1 ${c.color}`} style={{ fontWeight: 700 }}>{c.value}</p>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-muted" />
        <input
          type="text"
          placeholder="Search by name, phone or user id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                {["Customer", "Plan", "Progress", "Paid / Total", "Pending now", "Status", "Reminders", "Last reminder"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-warm-muted">No plans match.</td></tr>
              ) : (
                rows.map((r) => {
                  const progress = r.totalAmount > 0 ? Math.min(100, Math.round((r.amountPaid / r.totalAmount) * 100)) : 0;
                  const [cls, label] = BADGE[r.paymentStatus];
                  return (
                    <tr key={r.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink text-[13px]">
                          {r.customer.name}
                          {r.customer.isDeleted && <span className="ml-2 text-[10px] text-warm-muted">(account closed)</span>}
                        </p>
                        <p className="text-xs text-warm-muted">{r.customer.phone}</p>
                        <p className="text-[10px] text-warm-muted font-mono">{r.customer.userId}</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-ink">
                        {r.chits} chit{r.chits === 1 ? "" : "s"} · {formatCurrency(r.monthlyAmount)}/mo
                        <p className="text-[11px] text-warm-muted">{r.cycleLabel}</p>
                      </td>
                      <td className="px-4 py-3 min-w-[130px]">
                        <div className="h-1.5 rounded-full bg-parchment overflow-hidden">
                          <div className="h-full bg-forest" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-[11px] text-warm-muted mt-1">{r.monthsPaid}/{r.durationMonths} months · {progress}%</p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-ink whitespace-nowrap">
                        {formatCurrency(r.amountPaid)} <span className="text-warm-muted">/ {formatCurrency(r.totalAmount)}</span>
                      </td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                        {r.outstanding > 0 ? (
                          <>
                            <span className="text-ink font-medium">{formatCurrency(r.outstanding)}</span>
                            <p className="text-[11px] text-warm-muted">
                              {r.monthsPending} month{r.monthsPending === 1 ? "" : "s"}{r.isPartiallyPaid ? " · part paid" : ""}
                            </p>
                          </>
                        ) : <span className="text-warm-muted">—</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cls}`}>{label}</span></td>
                      <td className="px-4 py-3 text-[13px] text-ink whitespace-nowrap">
                        {r.remindersSent} sent
                        {r.remindersFailed > 0 && <span className="text-destructive"> · {r.remindersFailed} failed</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-warm-muted whitespace-nowrap">
                        {r.lastReminderAt ? formatIST(r.lastReminderAt, "d MMM, h:mm a") : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} totalPages={data?.totalPages ?? 1} onPage={setPage} busy={isFetching} />
      </div>
    </div>
  );
}
