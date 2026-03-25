import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search, RotateCcw, ChevronDown, ChevronUp, MapPin, CreditCard, Package } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type OrderItem = { productId: number; productName: string; quantity: number; price: number; subtotal: number };
type Order = {
  id: number; userId: number; customerName: string; customerPhone?: string;
  items: OrderItem[]; total: number; status: string; paymentStatus: string;
  address?: string; paymentMethod?: string; createdAt: string;
};

function useOrders() {
  return useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    queryFn: async () => {
      const res = await fetch("/api/admin/orders");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });
}

function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, paymentStatus }: { id: number; status?: string; paymentStatus?: string }) => {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paymentStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/orders"] }),
  });
}

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

function getStatusBadge(status: string) {
  if (status === "delivered") return "success";
  if (status === "cancelled" || status === "failed") return "destructive";
  if (status === "shipped" || status === "processing") return "warning";
  if (status === "paid") return "success";
  return "default";
}

export function Orders() {
  const { data: orders = [], isLoading, dataUpdatedAt } = useOrders();
  const updateMutation = useUpdateOrder();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [paymentFilter, setPaymentFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [applied, setApplied] = React.useState({ search: "", status: "all", payment: "all", from: "", to: "" });
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState(new Date());

  React.useEffect(() => { setLastRefresh(new Date()); }, [dataUpdatedAt]);

  const applyFilters = () => setApplied({ search, status: statusFilter, payment: paymentFilter, from: dateFrom, to: dateTo });
  const resetFilters = () => {
    setSearch(""); setStatusFilter("all"); setPaymentFilter("all"); setDateFrom(""); setDateTo("");
    setApplied({ search: "", status: "all", payment: "all", from: "", to: "" });
  };

  const filtered = orders.filter(o => {
    if (applied.status !== "all" && o.status !== applied.status) return false;
    if (applied.payment !== "all" && o.paymentStatus !== applied.payment) return false;
    if (applied.search) {
      const s = applied.search.toLowerCase();
      if (!o.customerName.toLowerCase().includes(s) && !String(o.id).includes(s)) return false;
    }
    if (applied.from) { const d = new Date(o.createdAt); if (d < new Date(applied.from)) return false; }
    if (applied.to) { const d = new Date(o.createdAt); if (d > new Date(applied.to + "T23:59:59")) return false; }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Order Management</h1>
        <p className="text-warm-secondary mt-1 text-sm">
          <strong>Tracking:</strong> Orders from the mobile app appear here. Status updates reflect in the app immediately.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order ID, customer..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none">
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none">
            <option value="all">All payment status</option>
            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none" />
          <button onClick={applyFilters} className="px-4 py-2 rounded-lg bg-foreground text-white text-sm font-medium hover:bg-foreground/90 transition-colors">Apply</button>
          <button onClick={resetFilters} className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/30 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
            Auto-refresh 10s · Last: {format(lastRefresh, "h:mm:ss a")}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Order ID</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Customer</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Total</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Status</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Payment</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Date</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No orders match your filters.</td></tr>
              ) : (
                filtered.map(order => (
                  <React.Fragment key={order.id}>
                    <tr className={`border-t border-border/50 hover:bg-muted/10 cursor-pointer ${expandedId === order.id ? "bg-muted/10" : ""}`} onClick={() => setExpandedId(prev => prev === order.id ? null : order.id)}>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {String(order.id).substring(0, 8)}...
                      </td>
                      <td className="px-4 py-3 font-medium">{order.customerName}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(order.total)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={order.status}
                          onChange={e => updateMutation.mutate({ id: order.id, status: e.target.value })}
                          className={`text-xs font-semibold rounded px-2 py-1 border-none outline-none cursor-pointer appearance-none ${
                            order.status === "delivered" ? "bg-green-100 text-green-700" :
                            order.status === "cancelled" ? "bg-red-100 text-red-700" :
                            order.status === "shipped" || order.status === "processing" ? "bg-amber-100 text-amber-700" :
                            "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={order.paymentStatus}
                          onChange={e => updateMutation.mutate({ id: order.id, paymentStatus: e.target.value })}
                          className={`text-xs font-semibold rounded px-2 py-1 border-none outline-none cursor-pointer appearance-none ${
                            order.paymentStatus === "paid" ? "bg-green-100 text-green-700" :
                            order.paymentStatus === "failed" ? "bg-red-100 text-red-700" :
                            "bg-muted text-muted-foreground"
                          }`}
                        >
                          {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{format(new Date(order.createdAt), "d/M/yyyy")}</td>
                      <td className="px-4 py-3">
                        <button className="text-xs text-primary hover:underline font-medium">
                          {expandedId === order.id ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedId === order.id && (
                        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <td colSpan={7} className="px-6 py-5 bg-muted/5 border-t border-border/30">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1.5"><Package className="w-4 h-4" /> Order Items</h4>
                                <div className="space-y-2 bg-white border border-border rounded-xl p-4">
                                  {order.items.map(item => (
                                    <div key={item.productId} className="flex justify-between items-center text-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="w-7 h-7 rounded bg-muted flex items-center justify-center text-xs font-bold">{item.quantity}x</span>
                                        <span>{item.productName}</span>
                                      </div>
                                      <span className="text-muted-foreground">{formatCurrency(item.subtotal)}</span>
                                    </div>
                                  ))}
                                  <div className="pt-2 border-t border-border flex justify-between font-bold text-sm">
                                    <span>Total</span><span className="text-primary">{formatCurrency(order.total)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Shipping</h4>
                                  <div className="bg-white border border-border rounded-xl p-4 text-sm text-muted-foreground">
                                    {order.address || "No address provided."}
                                  </div>
                                </div>
                                <div>
                                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1.5"><CreditCard className="w-4 h-4" /> Payment</h4>
                                  <div className="bg-white border border-border rounded-xl p-4 text-sm text-muted-foreground flex items-center gap-2">
                                    <Badge variant={order.paymentStatus === "paid" ? "success" : "default"}>{order.paymentStatus}</Badge>
                                    <span>{order.paymentMethod || "Standard"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
