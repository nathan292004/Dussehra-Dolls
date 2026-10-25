import * as React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounced } from "@/hooks/use-paged";
import { Pager } from "@/components/pager";
import { formatIST } from "@/lib/time";
import { Check, X, Clock, ShieldCheck, ShieldX, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Plan = {
  id: number;
  name: string;
  chits: number;
  monthlyAmount: number;
  totalAmount: number;
  bonusPoints: number;
  cycleLabel: string;
  cycleEnded: boolean;
  reviewStatus: "under_review" | "rejected" | "active" | "completed";
  rejectionReason?: string | null;
  amountDueOnApproval: number | null;
  amountPaid: number;
  createdAt: string;
  reviewedAt?: string | null;
  customer: { userId: string; index: number; name: string; phone: string; registeredAt: string; isReseller: boolean };
};

type Tab = "under_review" | "approved" | "rejected" | "all";
type Response = { counts: Record<Tab, number>; plans: Plan[]; total: number; page: number; pageSize: number; totalPages: number };

const PAGE_SIZE = 25;

const TABS: { key: Tab; label: string }[] = [
  { key: "under_review", label: "Under review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function StatusPill({ plan }: { plan: Plan }) {
  const map = {
    under_review: ["bg-amber-100 text-amber-800", "UNDER REVIEW"],
    active: ["bg-forest-light text-forest", "APPROVED"],
    completed: ["bg-blue-100 text-blue-700", "COMPLETED"],
    rejected: ["bg-danger-light text-destructive", "REJECTED"],
  } as const;
  const [cls, label] = map[plan.reviewStatus];
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
}

export function ChitApprovals() {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<Tab>("under_review");
  const [rejecting, setRejecting] = React.useState<Plan | null>(null);
  const [reason, setReason] = React.useState("");
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const q = useDebounced(search.trim());
  React.useEffect(() => setPage(1), [q, tab]);
  const { data, isLoading, isFetching } = useQuery<Response>({
    queryKey: ["/api/admin/chit-plans", { tab, page, q }],
    queryFn: async () => {
      const params = new URLSearchParams({ status: tab, page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/chit-plans?${params}`);
      if (!res.ok) throw new Error("Could not load the plans");
      return res.json();
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
  const plans = data?.plans ?? [];
  const counts = data?.counts ?? { under_review: 0, approved: 0, rejected: 0, all: 0 };

  async function review(plan: Plan, action: "approve" | "reject", body?: unknown) {
    setBusyId(plan.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/chit-plans/${plan.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: result.error || "Could not update the plan." });
      } else {
        setMessage({
          kind: "ok",
          text: action === "approve"
            ? `Approved ${plan.customer.name}'s plan. They have been told on WhatsApp.`
            : `Rejected ${plan.customer.name}'s plan. They have been told on WhatsApp.`,
        });
      }
      await qc.invalidateQueries({ queryKey: ["/api/admin/chit-plans"] });
      await qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    } finally {
      setBusyId(null);
      setRejecting(null);
      setReason("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Chit Approvals</h1>
        <p className="text-warm-secondary mt-1 text-sm">
          Customers submit a chit plan and it waits here. Approve it so the customer can start paying, or reject it with a reason.
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.kind === "ok" ? "bg-forest-light border-forest/30 text-forest-dark" : "bg-danger-light border-destructive/30 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm border transition-colors ${
              tab === t.key ? "bg-ink text-white border-ink" : "bg-white text-warm-secondary border-warm-border hover:bg-parchment"
            }`}
          >
            {t.label}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/20" : "bg-parchment"}`}>
              {counts[t.key]}
            </span>
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
                {["Customer", "Plan", "Monthly", "Total", "Bonus", "Plan year", tab === "under_review" ? "Due on approval" : "Paid", "Submitted", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-warm-muted">
                  {tab === "under_review" ? "Nothing waiting for review. 🎉" : "No plans here."}
                </td></tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink text-[13px]">{p.customer.name}</p>
                      <p className="text-xs text-warm-muted">{p.customer.phone}</p>
                      <p className="text-[10px] text-warm-muted font-mono">{p.customer.userId} · #{p.customer.index}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-ink">{p.chits} chit{p.chits === 1 ? "" : "s"}</td>
                    <td className="px-4 py-3 text-[13px] text-ink">{formatCurrency(p.monthlyAmount)}</td>
                    <td className="px-4 py-3 text-[13px] text-ink">{formatCurrency(p.totalAmount)}</td>
                    <td className="px-4 py-3 text-[13px] text-forest">+{p.bonusPoints.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-xs text-warm-secondary whitespace-nowrap">{p.cycleLabel}</td>
                    <td className="px-4 py-3 text-[13px] text-ink">
                      {p.reviewStatus === "under_review" ? formatCurrency(p.amountDueOnApproval ?? 0) : formatCurrency(p.amountPaid)}
                    </td>
                    <td className="px-4 py-3 text-xs text-warm-muted whitespace-nowrap">{formatIST(p.createdAt, "d MMM yyyy, h:mm a")}</td>
                    <td className="px-4 py-3">
                      <StatusPill plan={p} />
                      {p.reviewStatus === "rejected" && p.rejectionReason && (
                        <p className="text-xs text-warm-muted mt-1 max-w-[200px]">{p.rejectionReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.reviewStatus === "under_review" ? (
                        <div className="flex gap-2">
                          <button
                            disabled={busyId === p.id || p.cycleEnded}
                            onClick={() => review(p, "approve")}
                            title={p.cycleEnded ? "This plan year has ended, so it can only be rejected." : "Approve this plan"}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-forest text-white text-xs font-medium disabled:opacity-40"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            disabled={busyId === p.id}
                            onClick={() => { setRejecting(p); setReason(""); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive text-xs font-medium disabled:opacity-40"
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      ) : p.reviewStatus === "rejected" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-warm-muted"><ShieldX className="w-3.5 h-3.5" /> Reviewed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-warm-muted"><ShieldCheck className="w-3.5 h-3.5" /> Reviewed</span>
                      )}
                      {p.reviewStatus === "under_review" && p.cycleEnded && (
                        <p className="text-[11px] text-destructive mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Plan year ended</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} totalPages={data?.totalPages ?? 1} onPage={setPage} busy={isFetching} />
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => busyId === null && setRejecting(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl text-ink">Reject this plan?</h2>
            <p className="text-sm text-warm-secondary">
              {rejecting.customer.name} · {rejecting.chits} chit{rejecting.chits === 1 ? "" : "s"} · {formatCurrency(rejecting.monthlyAmount)}/month.
              They will get a WhatsApp message and can submit a new plan.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="reject-reason" className="text-sm font-medium text-ink">Reason (optional, sent to the customer)</label>
              <textarea
                id="reject-reason"
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
              />
              <p className="text-xs text-warm-muted text-right">{reason.length}/300</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejecting(null)} className="px-4 py-2 rounded-lg text-sm text-warm-secondary hover:bg-parchment">Cancel</button>
              <button
                disabled={busyId === rejecting.id}
                onClick={() => review(rejecting, "reject", { reason })}
                className="px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium disabled:opacity-50"
              >
                Reject plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
