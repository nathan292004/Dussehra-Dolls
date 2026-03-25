import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

type ChitEnrollment = {
  id: number;
  planId: number;
  planName: string;
  totalAmount: number;
  monthlyEmi: number;
  duration: number;
  monthsCompleted: number;
  amountPaid: number;
  paidThisMonth: number;
  progress: number;
  status: string;
  isCompleted: boolean;
  isOverdue: boolean;
  daysOverdue: number;
  joinedAt: string;
  nextPaymentDate?: string | null;
  paymentStatus: "paid" | "pending" | "overdue";
  user: { id: number; name: string; email: string; phone?: string | null } | null;
};

type ChitSubData = {
  stats: {
    totalSubscriptions: number;
    thisMonthPaid: number;
    thisMonthPending: number;
    overdueCount: number;
    completedPlans: number;
  };
  enrollments: ChitEnrollment[];
};

function useChitSubs() {
  return useQuery<ChitSubData>({
    queryKey: ["/api/admin/chit-subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/chit-subscriptions");
      if (!res.ok) return {
        stats: { totalSubscriptions: 0, thisMonthPaid: 0, thisMonthPending: 0, overdueCount: 0, completedPlans: 0 },
        enrollments: [],
      };
      return res.json();
    },
    refetchInterval: 15000,
  });
}

function StatusBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  if (isOverdue) {
    return (
      <span className="text-xs px-2 py-0.5 rounded font-semibold bg-red-100 text-red-700">
        OVERDUE
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="text-xs px-2 py-0.5 rounded font-semibold bg-blue-100 text-blue-700">
        COMPLETED
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold bg-green-100 text-green-700">
      ACTIVE
    </span>
  );
}

function PaymentBadge({ paymentStatus }: { paymentStatus: "paid" | "pending" | "overdue" }) {
  if (paymentStatus === "paid") {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Paid</span>;
  }
  if (paymentStatus === "overdue") {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Overdue</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">Pending</span>;
}

export function ChitSubscriptions() {
  const { data, isLoading } = useChitSubs();
  const stats = data?.stats ?? { totalSubscriptions: 0, thisMonthPaid: 0, thisMonthPending: 0, overdueCount: 0, completedPlans: 0 };
  const enrollments = data?.enrollments ?? [];

  const [filter, setFilter] = React.useState<"all" | "paid" | "pending" | "overdue" | "completed">("all");
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const filtered = enrollments.filter(e => {
    if (filter === "paid") return e.paymentStatus === "paid" && !e.isCompleted;
    if (filter === "pending") return e.paymentStatus === "pending";
    if (filter === "overdue") return e.isOverdue;
    if (filter === "completed") return e.isCompleted;
    return true;
  });

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
    { label: "Overdue", value: stats.overdueCount, color: "text-red-600" },
    { label: "Completed", value: stats.completedPlans, color: "text-blue-600" },
  ];

  const filterTabs = [
    { key: "all" as const, label: `All (${stats.totalSubscriptions})` },
    { key: "paid" as const, label: `Paid (${stats.thisMonthPaid})` },
    { key: "pending" as const, label: `Pending (${stats.thisMonthPending})` },
    { key: "overdue" as const, label: `Overdue (${stats.overdueCount})` },
    { key: "completed" as const, label: `Completed (${stats.completedPlans})` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Chit Subscriptions &amp; Payments</h1>
        <p className="text-muted-foreground mt-1">Track all active chit plans, EMI payments, and member progress.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key
                ? tab.key === "overdue"
                  ? "bg-red-600 text-white"
                  : tab.key === "completed"
                  ? "bg-blue-600 text-white"
                  : "bg-foreground text-white"
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
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">Monthly EMI</th>
                    <th className="px-4 py-3 text-left">This Month</th>
                    <th className="px-4 py-3 text-left">Months Progress</th>
                    <th className="px-4 py-3 text-left">Total Progress</th>
                    <th className="px-4 py-3 text-left">Next Payment</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map(e => (
                    <React.Fragment key={e.id}>
                      <tr
                        className={`border-t border-border/50 hover:bg-muted/10 transition-colors ${
                          e.isOverdue ? "bg-red-50/50" : e.isCompleted ? "bg-blue-50/30" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{e.user?.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{e.user?.email ?? "—"}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{e.user?.phone ?? "—"}</td>
                        <td className="px-4 py-3 font-medium">
                          ₹{e.monthlyEmi.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {e.isCompleted ? (
                              <span className="text-blue-600 text-xs font-medium">All paid</span>
                            ) : (
                              <>
                                <span className={
                                  e.paymentStatus === "paid" ? "text-green-600 font-medium text-xs" :
                                  e.paymentStatus === "overdue" ? "text-red-600 font-medium text-xs" :
                                  "text-orange-500 text-xs"
                                }>
                                  {e.paymentStatus === "paid"
                                    ? `₹${e.monthlyEmi.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                                    : e.isOverdue
                                    ? `${e.daysOverdue}d overdue`
                                    : "Not yet"}
                                </span>
                                <PaymentBadge paymentStatus={e.paymentStatus} />
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground">{e.monthsCompleted}</span>
                            <span className="text-muted-foreground text-xs">/ {e.duration} mo</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${e.isCompleted ? "bg-blue-500" : e.isOverdue ? "bg-red-400" : "bg-primary"}`}
                                style={{ width: `${e.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{e.progress}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {e.isCompleted
                            ? <span className="text-blue-600 font-medium">Completed</span>
                            : e.nextPaymentDate
                            ? (
                              <span className={e.isOverdue ? "text-red-600 font-medium" : ""}>
                                {format(new Date(e.nextPaymentDate), "d MMM yyyy")}
                              </span>
                            )
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={e.status} isOverdue={e.isOverdue} />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                            className="text-xs text-primary hover:underline font-medium whitespace-nowrap"
                          >
                            {expandedId === e.id ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {expandedId === e.id && (
                        <tr className={`border-t border-border/30 ${e.isOverdue ? "bg-red-50/70" : "bg-muted/10"}`}>
                          <td colSpan={9} className="px-6 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Enrollment ID</p>
                                <p className="font-medium">#{e.id}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Joined On</p>
                                <p className="font-medium">{format(new Date(e.joinedAt), "d MMM yyyy")}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Total Target</p>
                                <p className="font-medium">₹{e.totalAmount.toLocaleString("en-IN")}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Amount Paid So Far</p>
                                <p className="font-medium text-green-700">₹{e.amountPaid.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Remaining</p>
                                <p className="font-medium">₹{Math.max(0, e.totalAmount - e.amountPaid).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Months Paid</p>
                                <p className="font-medium">{e.monthsCompleted} of {e.duration}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Plan Status</p>
                                <StatusBadge status={e.status} isOverdue={e.isOverdue} />
                              </div>
                              {e.isOverdue && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Days Overdue</p>
                                  <p className="font-medium text-red-600">{e.daysOverdue} days</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
