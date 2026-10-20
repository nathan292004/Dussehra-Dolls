import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { RefreshCw, BellRing, MessageSquareWarning, AlarmClock, Layers, ClipboardCheck, Wallet, PackageSearch, Users } from "lucide-react";

const rupees = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });

type Customer = { userId: string; index: number; name: string; phone: string; isDeleted: boolean };
type PendingRow = {
  chitPlanId: number;
  planName: string;
  customer: Customer;
  monthlyAmount: number;
  amountPaid: number;
  outstanding: number;
  monthsPending: number;
  paymentStatus: "paid" | "pending" | "overdue" | "completed";
  isPartiallyPaid: boolean;
  remindersSent: number;
  remindersFailed: number;
  lastReminderAt: string | null;
};
type KindRow = { kind: string; channel: string; sent24h: number; sent7d: number; sent30d: number; sentAll: number; failed30d: number; failedAll: number };

type Ops = {
  generatedAt: string;
  cycle: { open: boolean; label: string; monthName: string; monthNumber: number };
  payments: {
    activePlans: number; completedPlans: number; paidUp: number; pending: number; late: number;
    multiMonthPending: number; partiallyPaid: number; neverPaid: number; expectedSoFar: number;
    collectedActive: number; outstandingTotal: number; monthlyRunRate: number; collectionRate: number | null;
  };
  pendingPayments: PendingRow[];
  latePayments: PendingRow[];
  multiMonthPending: PendingRow[];
  reminders: {
    periodKey: string; sentThisMonth: number; failedThisMonth: number; sentAllTime: number; failedAllTime: number;
    owingNeverReminded: number;
    byKind: { kind: string; label: string; sentThisMonth: number; failedThisMonth: number; sentAllTime: number }[];
  };
  recentReminders: {
    id: number; kind: string; periodKey: string; status: string; attempts: number; lastError: string | null;
    amountDue: number | null; sentAt: string | null; updatedAt: string; planName: string; customerName: string; phone: string;
  }[];
  notifications: {
    sentLast24h: number; sentLast7d: number; sentLast30d: number; sentAllTime: number; failedLast30d: number; failedAllTime: number;
    byKind: KindRow[];
  };
  recentFailures: { id: number; kind: string; channel: string; phone: string; error: string | null; createdAt: string }[];
  recentNotifications: { id: number; kind: string; channel: string; status: string; phone: string; createdAt: string }[];
  collectionsByMonth: { month: string; total: number; payments: number }[];
  approvals: { pending: number; oldestPendingAt: string | null };
  customers: { total: number; newLast30d: number; resellers: number; closed: number };
  checkouts: { waitingForPayment: number; unitsHeld: number };
  lowStock: { id: number; name: string; stock: number; reserved: number; available: number }[];
  wallets: { spendable: number; lockedInChits: number };
};

const KIND_LABEL: Record<string, string> = {
  chit_reminder_day4: "Reminder · 4th of month",
  chit_reminder_day10: "Reminder · 10th of month",
  chit_payment_received: "Chit payment received",
  chit_payment_partial: "Part-payment notice",
  chit_completed: "Chit plan completed",
  chit_plan_submitted: "Plan received (under review)",
  chit_plan_approved: "Plan approved",
  chit_plan_rejected: "Plan rejected",
  order_confirmed: "Order confirmed",
  wallet_topup: "Wallet top-up",
  otp_register: "OTP · sign-up",
  otp_reset: "OTP · forgot password",
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

function Stat({ icon: Icon, label, value, sub, tone = "ink" }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: "ink" | "forest" | "danger" | "amber";
}) {
  const color = { ink: "text-ink", forest: "text-forest", danger: "text-destructive", amber: "text-amber-700" }[tone];
  return (
    <div className="bg-white rounded-2xl border border-warm-border p-5">
      <div className="flex items-center gap-2 text-xs text-warm-muted uppercase tracking-wider"><Icon className="w-4 h-4" />{label}</div>
      <p className={`text-3xl font-display mt-2 ${color}`} style={{ fontWeight: 700 }}>{value}</p>
      {sub && <p className="text-xs text-warm-secondary mt-1">{sub}</p>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-warm-border overflow-hidden">
      <div className="px-5 py-4 border-b border-parchment">
        <h2 className="text-lg text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-warm-secondary mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

const th = "px-4 py-2.5 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium whitespace-nowrap";

function PendingTable({ rows, empty }: { rows: PendingRow[]; empty: string }) {
  return (
    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-parchment">
          <tr>{["Customer", "Plan", "Pending", "Months behind", "Status", "Reminders", "Last reminder"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.chitPlanId} className="border-t border-parchment align-top">
              <td className="px-4 py-2.5">
                <p className="text-[13px] font-medium text-ink">{r.customer.name}</p>
                <p className="text-xs text-warm-muted">{r.customer.phone}</p>
              </td>
              <td className="px-4 py-2.5 text-[13px] text-ink whitespace-nowrap">{r.planName}</td>
              <td className="px-4 py-2.5 text-[13px] font-medium text-ink whitespace-nowrap">
                {rupees(r.outstanding)}
                {r.isPartiallyPaid && <p className="text-[11px] text-amber-700 font-normal">part paid</p>}
              </td>
              <td className="px-4 py-2.5 text-[13px]">
                <span className={r.monthsPending >= 2 ? "text-destructive font-semibold" : "text-ink"}>{r.monthsPending}</span>
              </td>
              <td className="px-4 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.paymentStatus === "overdue" ? "bg-danger-light text-destructive" : "bg-amber-100 text-amber-800"}`}>
                  {r.paymentStatus === "overdue" ? "Late" : "Pending"}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[13px] whitespace-nowrap">
                {r.remindersSent} sent{r.remindersFailed > 0 && <span className="text-destructive"> · {r.remindersFailed} failed</span>}
              </td>
              <td className="px-4 py-2.5 text-xs text-warm-muted whitespace-nowrap">
                {r.lastReminderAt ? formatDistanceToNow(new Date(r.lastReminderAt), { addSuffix: true }) : "never"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tracking() {
  const [view, setView] = React.useState<"pending" | "late" | "multi">("pending");
  const { data, isLoading, isFetching, refetch } = useQuery<Ops | null>({
    queryKey: ["/api/admin/ops"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ops");
      return res.ok ? res.json() : null;
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <p className="text-warm-muted">Loading...</p>;
  if (!data) return <p className="text-destructive">Could not load the dashboard. Please refresh.</p>;

  const d = data;
  const rows = view === "pending" ? d.pendingPayments : view === "late" ? d.latePayments : d.multiMonthPending;
  const maxMonth = Math.max(1, ...d.collectionsByMonth.map((m) => m.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-ink">Reminders &amp; Tracking</h1>
          <p className="text-warm-secondary mt-1 text-sm">
            Plan year {d.cycle.label} · now {d.cycle.open ? `${d.cycle.monthName} (month ${d.cycle.monthNumber} of 11)` : "between plan years"}.
            Updated {format(new Date(d.generatedAt), "h:mm a")}.
          </p>
        </div>
        <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-warm-border bg-white text-sm text-warm-secondary hover:bg-parchment">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Stat icon={BellRing} label="Reminders sent" value={d.reminders.sentThisMonth} tone="forest"
          sub={`this month${d.reminders.failedThisMonth ? ` · ${d.reminders.failedThisMonth} failed` : ""}`} />
        <Stat icon={MessageSquareWarning} label="Notifications sent" value={d.notifications.sentLast24h}
          sub={`last 24h · ${d.notifications.sentLast7d} in 7 days · ${d.notifications.sentLast30d} in 30 days`} />
        <Stat icon={MessageSquareWarning} label="Failed to send" value={d.notifications.failedLast30d}
          tone={d.notifications.failedLast30d ? "danger" : "ink"} sub="last 30 days" />
        <Stat icon={AlarmClock} label="Late payments" value={d.payments.late} tone={d.payments.late ? "danger" : "ink"}
          sub={`${d.payments.pending} more pending`} />
        <Stat icon={Layers} label="2+ months behind" value={d.payments.multiMonthPending} tone={d.payments.multiMonthPending ? "danger" : "ink"}
          sub={`${d.payments.partiallyPaid} part-paid · ${d.payments.neverPaid} never paid`} />
        <Stat icon={ClipboardCheck} label="Awaiting approval" value={d.approvals.pending} tone={d.approvals.pending ? "amber" : "ink"}
          sub={d.approvals.oldestPendingAt ? `oldest ${formatDistanceToNow(new Date(d.approvals.oldestPendingAt), { addSuffix: true })}` : "all caught up"} />
      </div>

      {/* Money */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Wallet} label="Collected (active plans)" value={rupees(d.payments.collectedActive)}
          sub={`of ${rupees(d.payments.expectedSoFar)} due so far`} tone="forest" />
        <Stat icon={Wallet} label="Still to collect" value={rupees(d.payments.outstandingTotal)}
          sub={d.payments.collectionRate === null ? "no plans yet" : `${d.payments.collectionRate}% of what is due is paid`} tone={d.payments.outstandingTotal ? "amber" : "ink"} />
        <Stat icon={Wallet} label="Expected each month" value={rupees(d.payments.monthlyRunRate)}
          sub={`${d.payments.activePlans} active · ${d.payments.completedPlans} completed plans`} />
        <Stat icon={Wallet} label="Customer wallets" value={rupees(d.wallets.spendable)}
          sub={`${rupees(d.wallets.lockedInChits)} locked in chit plans`} />
      </div>

      {/* Who owes what */}
      <Card title="Who needs to pay" subtitle="Approved chit plans with an amount pending, biggest first.">
        <div className="px-5 pt-3 flex flex-wrap gap-2">
          {([
            ["pending", `All pending (${d.pendingPayments.length})`],
            ["late", `Late (${d.latePayments.length})`],
            ["multi", `2+ months behind (${d.multiMonthPending.length})`],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-3 py-1.5 rounded-lg text-xs border ${view === k ? "bg-ink text-white border-ink" : "bg-white text-warm-secondary border-warm-border hover:bg-parchment"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="pt-3">
          <PendingTable rows={rows} empty="Nobody here. 🎉" />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Reminders */}
        <Card title="Reminders" subtitle="WhatsApp messages on the 4th (everyone with a pending amount) and the 10th (still unpaid).">
          <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-parchment">
            {d.reminders.byKind.map((k) => (
              <div key={k.kind} className="rounded-xl bg-parchment/60 p-3">
                <p className="text-xs text-warm-secondary">{k.label}</p>
                <p className="text-2xl font-display text-ink mt-1" style={{ fontWeight: 700 }}>{k.sentThisMonth}</p>
                <p className="text-[11px] text-warm-muted">sent this month{k.failedThisMonth ? ` · ${k.failedThisMonth} failed` : ""} · {k.sentAllTime} all time</p>
              </div>
            ))}
            <p className="col-span-2 text-xs text-warm-secondary">
              {d.reminders.owingNeverReminded > 0
                ? `${d.reminders.owingNeverReminded} customer(s) who owe money have not been sent any reminder yet (for example approved after the 10th).`
                : "Everyone who owes money has been reminded at least once."}
            </p>
          </div>
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-parchment"><tr>{["Customer", "Reminder", "Result", "Tries", "When"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.recentReminders.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-warm-muted">No reminders sent yet.</td></tr>
                ) : d.recentReminders.map((r) => (
                  <tr key={r.id} className="border-t border-parchment align-top">
                    <td className="px-4 py-2.5"><p className="text-[13px] text-ink">{r.customerName}</p><p className="text-xs text-warm-muted">{r.phone}</p></td>
                    <td className="px-4 py-2.5 text-xs text-warm-secondary whitespace-nowrap">{r.kind === "day4" ? "4th" : "10th"} · {r.periodKey}{r.amountDue != null && <p>{rupees(r.amountDue)} due</p>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "sent" ? "bg-forest-light text-forest" : r.status === "failed" ? "bg-danger-light text-destructive" : "bg-amber-100 text-amber-800"}`}>{r.status}</span>
                      {r.lastError && <p className="text-[11px] text-destructive mt-1 max-w-[180px] break-words">{r.lastError}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-[13px]">{r.attempts}</td>
                    <td className="px-4 py-2.5 text-xs text-warm-muted whitespace-nowrap">{formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Notifications */}
        <Card title="All notifications" subtitle="Every WhatsApp and SMS the system sends, by type.">
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-parchment"><tr>{["Type", "Channel", "24h", "7 days", "30 days", "All time", "Failed (30d)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.notifications.byKind.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">Nothing sent yet.</td></tr>
                ) : d.notifications.byKind.map((k) => (
                  <tr key={`${k.kind}-${k.channel}`} className="border-t border-parchment">
                    <td className="px-4 py-2.5 text-[13px] text-ink">{kindLabel(k.kind)}</td>
                    <td className="px-4 py-2.5 text-xs text-warm-secondary">{k.channel}</td>
                    <td className="px-4 py-2.5 text-[13px]">{k.sent24h}</td>
                    <td className="px-4 py-2.5 text-[13px]">{k.sent7d}</td>
                    <td className="px-4 py-2.5 text-[13px]">{k.sent30d}</td>
                    <td className="px-4 py-2.5 text-[13px]">{k.sentAll}</td>
                    <td className={`px-4 py-2.5 text-[13px] ${k.failed30d ? "text-destructive font-semibold" : ""}`}>{k.failed30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-parchment">
            <p className="px-5 pt-3 text-xs font-medium text-warm-secondary uppercase tracking-wider">Recent failures</p>
            <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {d.recentFailures.length === 0 ? (
                    <tr><td className="px-5 py-5 text-warm-muted text-sm">No failed messages. 👍</td></tr>
                  ) : d.recentFailures.map((f) => (
                    <tr key={f.id} className="border-t border-parchment first:border-t-0 align-top">
                      <td className="px-5 py-2 text-[13px] text-ink">{kindLabel(f.kind)}<p className="text-xs text-warm-muted">{f.phone}</p></td>
                      <td className="px-4 py-2 text-xs text-destructive max-w-[220px] break-words">{f.error ?? "unknown error"}</td>
                      <td className="px-4 py-2 text-xs text-warm-muted whitespace-nowrap">{formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card title="Chit money collected" subtitle="Payments received per month.">
          <div className="p-5 space-y-3">
            {d.collectionsByMonth.length === 0 ? (
              <p className="text-sm text-warm-muted">No chit payments yet.</p>
            ) : d.collectionsByMonth.map((m) => (
              <div key={m.month}>
                <div className="flex justify-between text-xs text-warm-secondary"><span>{m.month}</span><span>{rupees(m.total)} · {m.payments} payment{m.payments === 1 ? "" : "s"}</span></div>
                <div className="h-2 rounded-full bg-parchment mt-1 overflow-hidden"><div className="h-full bg-forest" style={{ width: `${(m.total / maxMonth) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Customers" subtitle="">
          <div className="p-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-warm-muted flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Active</p><p className="text-2xl font-display text-ink" style={{ fontWeight: 700 }}>{d.customers.total}</p></div>
            <div><p className="text-xs text-warm-muted">New (30 days)</p><p className="text-2xl font-display text-forest" style={{ fontWeight: 700 }}>{d.customers.newLast30d}</p></div>
            <div><p className="text-xs text-warm-muted">Resellers</p><p className="text-2xl font-display text-ink" style={{ fontWeight: 700 }}>{d.customers.resellers}</p></div>
            <div><p className="text-xs text-warm-muted">Closed accounts</p><p className="text-2xl font-display text-warm-secondary" style={{ fontWeight: 700 }}>{d.customers.closed}</p></div>
          </div>
        </Card>

        <Card title="Checkouts and stock" subtitle="Items frozen while customers pay, and what is running low.">
          <div className="p-5 space-y-4">
            <div className="flex gap-6">
              <div><p className="text-xs text-warm-muted">Paying right now</p><p className="text-2xl font-display text-ink" style={{ fontWeight: 700 }}>{d.checkouts.waitingForPayment}</p></div>
              <div><p className="text-xs text-warm-muted flex items-center gap-1"><PackageSearch className="w-3.5 h-3.5" /> Units frozen</p><p className="text-2xl font-display text-ink" style={{ fontWeight: 700 }}>{d.checkouts.unitsHeld}</p></div>
            </div>
            <div>
              <p className="text-xs font-medium text-warm-secondary uppercase tracking-wider mb-2">Running low (under 5 available)</p>
              {d.lowStock.length === 0 ? <p className="text-sm text-warm-muted">Nothing is running low.</p> : (
                <ul className="space-y-1.5">
                  {d.lowStock.map((p) => (
                    <li key={p.id} className="flex justify-between text-sm">
                      <span className="text-ink">{p.name}</span>
                      <span className={p.available === 0 ? "text-destructive font-semibold" : "text-warm-secondary"}>
                        {p.available} left{p.reserved ? ` (${p.reserved} frozen)` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

