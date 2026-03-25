import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

type ChitPlan = {
  id: number;
  name: string;
  description?: string | null;
  totalAmount: number;
  monthlyContribution: number;
  duration: number;
  maxMembers: number;
  currentMembers: number;
  status: string;
  createdAt: string;
};

function useChitPlans() {
  return useQuery<ChitPlan[]>({
    queryKey: ["/api/admin/chit-plans"],
    queryFn: async () => { const res = await fetch("/api/admin/chit-plans"); return res.ok ? res.json() : []; },
    refetchInterval: 30000,
  });
}

export function ChitPlans() {
  const { data: plans = [], isLoading } = useChitPlans();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Chit Plans</h1>
        <p className="text-warm-secondary mt-1 text-sm">All chit savings plans — including custom plans created by customers.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-warm-border p-5">
          <p className="text-xs text-warm-muted uppercase tracking-wider">Total Plans</p>
          <p className="text-3xl font-display text-ink mt-1" style={{ fontWeight: 700 }}>{plans.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-warm-border p-5">
          <p className="text-xs text-warm-muted uppercase tracking-wider">Active</p>
          <p className="text-3xl font-display text-forest mt-1" style={{ fontWeight: 700 }}>{plans.filter(p => p.status === "active" || p.status === "open").length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-warm-border p-5">
          <p className="text-xs text-warm-muted uppercase tracking-wider">Total Value</p>
          <p className="text-3xl font-display text-ink mt-1" style={{ fontWeight: 700 }}>{formatCurrency(plans.reduce((s, p) => s + p.totalAmount, 0))}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Plan Name</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Total Amount</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Monthly EMI</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Duration</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Members</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Status</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">No chit plans found.</td></tr>
              ) : (
                plans.map(p => (
                  <tr key={p.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">{p.name}</td>
                    <td className="px-4 py-3 font-display text-ink text-[13px]" style={{ fontWeight: 600 }}>{formatCurrency(p.totalAmount)}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{formatCurrency(p.monthlyContribution)}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{p.duration} months</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{p.currentMembers} / {p.maxMembers}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        p.status === "open" || p.status === "active" ? "bg-forest-light text-forest" :
                        "bg-parchment text-warm-muted"
                      }`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-muted text-xs">{format(new Date(p.createdAt), "d/M/yyyy")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
