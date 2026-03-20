import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

type ChitEnrollment = {
  id: number;
  planId: number;
  planName: string;
  totalAmount: number;
  monthlyEmi: number;
  amountPaid: number;
  paidThisMonth: number;
  progress: number;
  status: string;
  isCompleted: boolean;
  joinedAt: string;
  nextPaymentDate?: string;
  paymentStatus: string;
  user: { id: number; name: string; email: string; phone?: string | null } | null;
};

type ChitSubData = {
  stats: { totalSubscriptions: number; thisMonthPaid: number; thisMonthPending: number; completedPlans: number };
  enrollments: ChitEnrollment[];
};

function useChitSubs() {
  return useQuery<ChitSubData>({
    queryKey: ["/api/admin/chit-subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/chit-subscriptions");
      if (!res.ok) return { stats: { totalSubscriptions: 0, thisMonthPaid: 0, thisMonthPending: 0, completedPlans: 0 }, enrollments: [] };
      return res.json();
    },
    refetchInterval: 15000,
  });
}

export function ChitSubscriptions() {
  const { data, isLoading } = useChitSubs();
  const stats = data?.stats ?? { totalSubscriptions: 0, thisMonthPaid: 0, thisMonthPending: 0, completedPlans: 0 };
  const enrollments = data?.enrollments ?? [];

  const [filter, setFilter] = React.useState<"all" | "paid" | "pending">("all");

  const filtered = enrollments.filter(e => {
    if (filter === "paid") return e.paymentStatus === "paid";
    if (filter === "pending") return e.paymentStatus === "pending";
    return true;
  });

  // Group by plan name
  const grouped = filtered.reduce((acc, e) => {
    const key = e.planName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {} as Record<string, ChitEnrollment[]>);

  const statCards = [
    { label: "Total Subscriptions", value: stats.totalSubscriptions, color: "text-foreground" },
    { label: "This Month Paid", value: stats.thisMonthPaid, color: "text-green-600" },
    { label: "This Month Pending", value: stats.thisMonthPending, color: "text-orange-500" },
    { label: "Completed Plans", value: stats.completedPlans, color: "text-blue-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Chit Subscriptions &amp; Payments</h1>
        <p className="text-muted-foreground mt-1">Track all active chit plans and EMI payments.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {([
          { key: "all", label: `All (${stats.totalSubscriptions})` },
          { key: "paid", label: `Paid (${stats.thisMonthPaid})` },
          { key: "pending", label: `Pending (${stats.thisMonthPending})` },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key
                ? "bg-foreground text-white"
                : "bg-white border border-border text-muted-foreground hover:bg-muted/30"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No subscriptions found.</div>
      ) : (
        Object.entries(grouped).map(([planName, subs]) => (
          <div key={planName} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border/50">
              <h3 className="font-semibold text-foreground">{planName}</h3>
              <span className="text-xs text-muted-foreground">{subs.length} subscriber{subs.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">EMI Amount</th>
                    <th className="px-4 py-3 text-left">This Month</th>
                    <th className="px-4 py-3 text-left">Progress</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map(e => (
                    <tr key={e.id} className="border-t border-border/50 hover:bg-muted/10">
                      <td className="px-4 py-3 font-medium">{e.user?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{e.user?.email ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.user?.phone ?? "—"}</td>
                      <td className="px-4 py-3 font-medium">₹{e.monthlyEmi.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={e.paymentStatus === "paid" ? "text-green-600 font-medium" : "text-orange-500"}>
                            ₹{e.paidThisMonth ?? "0.00"}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.paymentStatus === "paid" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                            {e.paymentStatus === "paid" ? "Paid" : "Pending"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${e.progress}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{e.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${e.status === "active" ? "bg-foreground text-white" : "bg-muted text-muted-foreground"}`}>
                          {e.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-xs text-primary hover:underline font-medium whitespace-nowrap">View Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
