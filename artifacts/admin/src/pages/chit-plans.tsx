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
        <h1 className="text-3xl font-bold text-foreground">Chit Plans</h1>
        <p className="text-muted-foreground mt-1">All chit savings plans — including custom plans created by customers.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Plans</p>
          <p className="text-3xl font-bold mt-1">{plans.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-3xl font-bold mt-1 text-green-600">{plans.filter(p => p.status === "active" || p.status === "open").length}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Value</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(plans.reduce((s, p) => s + p.totalAmount, 0))}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Plan Name</th>
                <th className="px-4 py-3 text-left">Total Amount</th>
                <th className="px-4 py-3 text-left">Monthly EMI</th>
                <th className="px-4 py-3 text-left">Duration</th>
                <th className="px-4 py-3 text-left">Members</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No chit plans found.</td></tr>
              ) : (
                plans.map(p => (
                  <tr key={p.id} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">{formatCurrency(p.totalAmount)}</td>
                    <td className="px-4 py-3">{formatCurrency(p.monthlyContribution)}</td>
                    <td className="px-4 py-3">{p.duration} months</td>
                    <td className="px-4 py-3">{p.currentMembers} / {p.maxMembers}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        p.status === "open" || p.status === "active" ? "bg-green-100 text-green-700" :
                        p.status === "closed" ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{format(new Date(p.createdAt), "d/M/yyyy")}</td>
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
