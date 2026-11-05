import * as React from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import {
  Plus, Search, Edit2, Trash2, PackagePlus, PackageMinus, AlertTriangle, Store, Boxes, TrendingUp, IndianRupee, PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PaginationBar } from "@/components/pagination-bar";
import { apiJson, queryString, useDebouncedValue, type Page } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

// Resellers hand their dolls to us and we sell them in the app. This page tracks what each one
// supplied, took back, has on the shelf and has sold. (Payouts are settled outside the system.)

type Metrics = {
  products: number; unitsReceived: number; unitsReturned: number; unitsInStock: number; unitsAvailable: number;
  unitsSold: number; revenue: number; lastSaleAt: string | null; sellThrough: number | null; stockDifference: number;
};
type Reseller = {
  id: number; name: string; contact?: string | null; email?: string | null; phone?: string | null;
  address?: string | null; notes?: string | null; isActive: boolean; createdAt: string; metrics: Metrics;
};
type ResellerDetail = Reseller & {
  products: Array<{
    id: number; name: string; category: string; imageUrl: string | null; price: number; isListed: boolean;
    stock: number; available: number; unitsReceived: number; unitsReturned: number; unitsSold: number; revenue: number; lastSaleAt: string | null;
  }>;
  monthly: Array<{ month: string; units: number; revenue: number }>;
};
type StockEntry = { id: number; productId: number | null; productName: string; kind: "received" | "returned"; quantity: number; note: string | null; createdAt: string };
type Insights = {
  resellers: { active: number; total: number };
  totals: {
    products: number; unitsInStock: number; unitsSold: number; revenue: number; revenueLast30d: number;
    shareOfStoreRevenue: number | null; ownStock: { unitsSold: number; revenue: number; revenueLast30d: number };
  };
  leaderboard: Array<{ id: number; name: string; isActive: boolean } & Metrics>;
  monthly: Array<{ month: string; resellerId: number; name: string; units: number; revenue: number }>;
  slowMovers: Array<{ productId: number; productName: string; resellerId: number; resellerName: string; available: number; lastSaleAt: string | null; addedAt: string }>;
  restock: Array<{ productId: number; productName: string; resellerId: number; resellerName: string; available: number }>;
};
type ProductOption = { id: number; name: string; resellerId: number | null; stock: number; availableStock: number };

const PAGE_SIZE = 20;
const KEY = "/api/admin/resellers";
const th = "px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium whitespace-nowrap";
const td = "px-4 py-3 text-[13px]";
const input = "w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm bg-white";
const CHART_COLOR = "#2E8B57";

const dateOrDash = (iso: string | null | undefined) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");
const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

/** The last `count` months as YYYY-MM, oldest first, so empty months still show as a zero bar. */
function lastMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => format(new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1), "yyyy-MM"));
}
function monthSeries(rows: Array<{ month: string; units: number; revenue: number }>, count: number) {
  const byMonth = new Map<string, { units: number; revenue: number }>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? { units: 0, revenue: 0 };
    byMonth.set(r.month, { units: m.units + r.units, revenue: m.revenue + r.revenue });
  }
  return lastMonths(count).map((month) => ({
    month,
    label: format(new Date(`${month}-01T00:00:00`), "MMM"),
    units: byMonth.get(month)?.units ?? 0,
    revenue: byMonth.get(month)?.revenue ?? 0,
  }));
}

function UnitsChart({ data, title }: { data: ReturnType<typeof monthSeries>; title: string }) {
  return (
    <div className="bg-white rounded-2xl border border-warm-border p-5">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <p className="text-xs text-warm-muted mb-4">Units in paid orders, by month</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EDE9E3" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#EDE9E3" }} tick={{ fontSize: 11, fill: "#6B6B65" }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9E9E99" }} />
            <Tooltip
              cursor={{ fill: "#F0EDE8" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border border-warm-border bg-white px-3 py-2 text-xs shadow-sm">
                    <p className="font-medium text-ink">{format(new Date(`${p.month}-01T00:00:00`), "MMMM yyyy")}</p>
                    <p className="text-warm-secondary">{p.units} units · {formatCurrency(p.revenue)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="units" fill={CHART_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-warm-border p-5">
      <div className="flex justify-between items-start mb-3">
        <p className="text-xs text-warm-muted uppercase tracking-wider">{label}</p>
        <div className="w-9 h-9 rounded-[10px] bg-forest-light flex items-center justify-center"><Icon className="h-4 w-4 text-forest" /></div>
      </div>
      <p className="text-3xl font-display text-ink" style={{ fontWeight: 700 }}>{value}</p>
      {sub && <p className="text-xs text-warm-muted mt-2">{sub}</p>}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex text-xs font-medium text-forest bg-forest-light px-2 py-0.5 rounded-full">Active</span>
  ) : (
    <span className="inline-flex text-xs font-medium text-warm-secondary bg-parchment px-2 py-0.5 rounded-full border border-warm-border">Inactive</span>
  );
}

// ─── data hooks ───────────────────────────────────────────────────────────────
function useInvalidateResellers() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [KEY] });
    void qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
  };
}

// ─── reseller form ────────────────────────────────────────────────────────────
type ResellerForm = { name: string; contact: string; email: string; phone: string; address: string; notes: string };
const emptyForm: ResellerForm = { name: "", contact: "", email: "", phone: "", address: "", notes: "" };

function ResellerFormModal({ editing, isOpen, onClose, onSaved }: { editing: Reseller | null; isOpen: boolean; onClose: () => void; onSaved?: (r: Reseller) => void }) {
  const invalidate = useInvalidateResellers();
  const [form, setForm] = React.useState<ResellerForm>(emptyForm);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!isOpen) return;
    setError("");
    setForm(editing ? {
      name: editing.name, contact: editing.contact ?? "", email: editing.email ?? "", phone: editing.phone ?? "",
      address: editing.address ?? "", notes: editing.notes ?? "",
    } : emptyForm);
  }, [isOpen, editing]);

  const save = useMutation({
    mutationFn: (data: ResellerForm) =>
      editing
        ? apiJson<Reseller>(`${KEY}/${editing.id}`, { method: "PUT", body: JSON.stringify(data) })
        : apiJson<Reseller>(KEY, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (r) => { invalidate(); onSaved?.(r); onClose(); },
    onError: (e: Error) => setError(e.message),
  });
  const field = (key: keyof ResellerForm) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? "Edit reseller" : "Add reseller"} description="Who supplies the dolls, and how to reach them.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) { setError("Name is required"); return; } save.mutate(form); }}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="r-name">Business / reseller name *</label>
            <input id="r-name" className={input} {...field("name")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="r-contact">Contact person</label>
            <input id="r-contact" className={input} {...field("contact")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="r-phone">Phone</label>
            <input id="r-phone" className={input} {...field("phone")} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="r-email">Email</label>
            <input id="r-email" type="email" className={input} {...field("email")} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="r-address">Address</label>
            <input id="r-address" className={input} {...field("address")} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="r-notes">Notes</label>
            <textarea id="r-notes" rows={2} className={`${input} resize-none`} placeholder="Terms agreed, pickup days…" {...field("notes")} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3 pt-4 border-t border-warm-border">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={save.isPending}>{editing ? "Save changes" : "Add reseller"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── stock received / returned ────────────────────────────────────────────────
function StockModal({ reseller, kind, onClose }: { reseller: ResellerDetail; kind: "received" | "returned" | null; onClose: () => void }) {
  const invalidate = useInvalidateResellers();
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");
  React.useEffect(() => { if (kind) { setProductId(""); setQuantity("1"); setNote(""); setError(""); } }, [kind]);

  // New stock can be for one of their products, or for a product that has no reseller yet (it gets linked).
  const { data: unassigned } = useQuery({
    queryKey: ["/api/admin/products", "unassigned"],
    queryFn: () => apiJson<Page<ProductOption>>("/api/admin/products?reseller=none&pageSize=100"),
    enabled: kind === "received",
  });
  const own = reseller.products.map((p) => ({ id: p.id, name: p.name, available: p.available, stock: p.stock }));
  const options = kind === "returned"
    ? own.filter((p) => p.available > 0)
    : [...own, ...(unassigned?.items ?? []).map((p) => ({ id: p.id, name: `${p.name} (our stock — will be linked)`, available: p.availableStock, stock: p.stock }))];
  const selected = options.find((p) => String(p.id) === productId);

  const save = useMutation({
    mutationFn: () => apiJson(`${KEY}/${reseller.id}/stock`, {
      method: "POST",
      body: JSON.stringify({ productId: Number(productId), kind, quantity: Number(quantity), note: note || undefined }),
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!productId) return setError("Choose a product");
    if (!Number.isInteger(qty) || qty < 1) return setError("Quantity must be a whole number of 1 or more");
    if (kind === "returned" && selected && qty > selected.available) return setError(`Only ${selected.available} unit(s) can be returned right now`);
    save.mutate();
  };

  return (
    <Modal
      isOpen={!!kind}
      onClose={onClose}
      title={kind === "returned" ? `Return stock to ${reseller.name}` : `Stock received from ${reseller.name}`}
      description={kind === "returned" ? "Units handed back to the reseller come off the shelf." : "Units they handed over go straight onto the shelf."}
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="s-product">Product</label>
          <select id="s-product" className={input} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select…</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.available} available</option>)}
          </select>
          {kind === "received" && (
            <p className="text-xs text-warm-muted">New doll? Add it on the Products page with this reseller selected, then record stock here.</p>
          )}
          {kind === "returned" && options.length === 0 && <p className="text-xs text-warm-muted">Nothing of theirs is free to return right now.</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="s-qty">Quantity</label>
          <input id="s-qty" type="number" min={1} className={input} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="s-note">Note</label>
          <input id="s-note" className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Batch, condition, who delivered…" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3 pt-4 border-t border-warm-border">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={save.isPending}>{kind === "returned" ? "Record return" : "Record stock"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── one reseller ─────────────────────────────────────────────────────────────
function ResellerDetailModal({ id, onClose, onEdit }: { id: number | null; onClose: () => void; onEdit: (r: Reseller) => void }) {
  const invalidate = useInvalidateResellers();
  const [stockKind, setStockKind] = React.useState<"received" | "returned" | null>(null);
  const [historyPage, setHistoryPage] = React.useState(1);
  const [actionError, setActionError] = React.useState("");
  React.useEffect(() => { setHistoryPage(1); setActionError(""); }, [id]);

  const { data: r, isLoading } = useQuery({
    queryKey: [KEY, "detail", id],
    queryFn: () => apiJson<ResellerDetail>(`${KEY}/${id}`),
    enabled: id !== null,
  });
  const { data: history, isFetching: historyFetching } = useQuery({
    queryKey: [KEY, "history", id, historyPage],
    queryFn: () => apiJson<Page<StockEntry>>(`${KEY}/${id}/stock-entries${queryString({ page: historyPage, pageSize: 10 })}`),
    enabled: id !== null,
    placeholderData: keepPreviousData,
  });

  const setActive = useMutation({
    mutationFn: (isActive: boolean) => apiJson(`${KEY}/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) }),
    onSuccess: () => { setActionError(""); invalidate(); },
    onError: (e: Error) => setActionError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => apiJson(`${KEY}/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: Error) => setActionError(e.message),
  });

  const m = r?.metrics;
  return (
    <>
      <Modal isOpen={id !== null && !stockKind} onClose={onClose} title={r?.name ?? "Reseller"} description={r ? [r.contact, r.phone, r.email].filter(Boolean).join(" · ") || "No contact details yet" : undefined} className="max-w-4xl">
        {isLoading || !r || !m ? (
          <p className="text-sm text-warm-muted">Loading…</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill active={r.isActive} />
              <span className="text-xs text-warm-muted">Since {dateOrDash(r.createdAt)}</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setStockKind("received")} disabled={!r.isActive}><PackagePlus className="w-4 h-4 mr-1" /> Stock received</Button>
                <Button size="sm" variant="outline" onClick={() => setStockKind("returned")}><PackageMinus className="w-4 h-4 mr-1" /> Return stock</Button>
                <Button size="sm" variant="ghost" onClick={() => onEdit(r)}><Edit2 className="w-4 h-4 mr-1" /> Edit</Button>
                <Button size="sm" variant="ghost" isLoading={setActive.isPending} onClick={() => setActive.mutate(!r.isActive)}>
                  {r.isActive ? "Deactivate" : "Reactivate"}
                </Button>
                {m.products === 0 && m.unitsReceived === 0 && m.unitsReturned === 0 && (
                  <Button size="sm" variant="destructive" isLoading={remove.isPending} onClick={() => { if (confirm(`Delete ${r.name}? This can't be undone.`)) remove.mutate(); }}>
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </Button>
                )}
              </div>
            </div>
            {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
            {!r.isActive && <p className="text-xs text-warm-secondary">Deactivated: no new stock or products can be added for them. Returns are still allowed.</p>}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Received", m.unitsReceived], ["Returned", m.unitsReturned], ["On the shelf", m.unitsInStock], ["Sold", m.unitsSold],
              ].map(([label, value]) => (
                <div key={label as string} role="group" aria-label={`${label}: ${value}`} className="rounded-xl border border-warm-border p-3">
                  <p className="text-[11px] text-warm-muted uppercase tracking-wider">{label}</p>
                  <p className="text-2xl font-display text-ink" style={{ fontWeight: 700 }}>{value}</p>
                </div>
              ))}
              <div className="rounded-xl border border-warm-border p-3">
                <p className="text-[11px] text-warm-muted uppercase tracking-wider">Revenue</p>
                <p className="text-xl font-display text-ink" style={{ fontWeight: 700 }}>{formatCurrency(m.revenue)}</p>
              </div>
              <div className="rounded-xl border border-warm-border p-3">
                <p className="text-[11px] text-warm-muted uppercase tracking-wider">Sell-through</p>
                <p className="text-xl font-display text-ink" style={{ fontWeight: 700 }}>{pct(m.sellThrough)}</p>
              </div>
              <div className="rounded-xl border border-warm-border p-3">
                <p className="text-[11px] text-warm-muted uppercase tracking-wider">Available now</p>
                <p className="text-xl font-display text-ink" style={{ fontWeight: 700 }}>{m.unitsAvailable}</p>
              </div>
              <div className="rounded-xl border border-warm-border p-3">
                <p className="text-[11px] text-warm-muted uppercase tracking-wider">Last sale</p>
                <p className="text-sm font-medium text-ink mt-1.5">{dateOrDash(m.lastSaleAt)}</p>
              </div>
            </div>

            {m.stockDifference !== 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Stock doesn't add up by {Math.abs(m.stockDifference)} unit(s).</strong> Received − returned − sold should equal what's on the shelf.
                  Stock was probably changed on the Products/Inventory page instead of being recorded here (or products were moved between resellers).
                </p>
              </div>
            )}

            <UnitsChart data={monthSeries(r.monthly, 12)} title="Sales, last 12 months" />

            <div>
              <h3 className="text-sm font-medium text-ink mb-2">Products ({r.products.length})</h3>
              <div className="rounded-xl border border-warm-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-parchment">
                    <th className={th}>Product</th><th className={th}>Price</th><th className={th}>Received</th><th className={th}>Returned</th>
                    <th className={th}>On shelf</th><th className={th}>Sold</th><th className={th}>Revenue</th><th className={th}>Last sale</th>
                  </tr></thead>
                  <tbody>
                    {r.products.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-warm-muted text-sm">No products yet. Add one on the Products page and pick this reseller.</td></tr>
                    ) : r.products.map((p) => (
                      <tr key={p.id} className="border-t border-parchment">
                        <td className={`${td} font-medium text-ink`}>{p.name}{!p.isListed && <span className="ml-2 text-[11px] text-warm-muted">(hidden)</span>}</td>
                        <td className={td}>{formatCurrency(p.price)}</td>
                        <td className={td}>{p.unitsReceived}</td>
                        <td className={td}>{p.unitsReturned}</td>
                        <td className={td}>{p.stock}{p.available !== p.stock && <span className="text-[11px] text-amber-700"> ({p.available} free)</span>}</td>
                        <td className={`${td} font-medium`}>{p.unitsSold}</td>
                        <td className={td}>{formatCurrency(p.revenue)}</td>
                        <td className={`${td} text-warm-muted text-xs`}>{dateOrDash(p.lastSaleAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-ink mb-2">Stock history</h3>
              <div className="rounded-xl border border-warm-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-parchment"><th className={th}>Date</th><th className={th}>Product</th><th className={th}>Movement</th><th className={th}>Note</th></tr></thead>
                  <tbody>
                    {!history || history.items.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-warm-muted text-sm">Nothing recorded yet.</td></tr>
                    ) : history.items.map((e) => (
                      <tr key={e.id} className="border-t border-parchment">
                        <td className={`${td} text-xs text-warm-muted whitespace-nowrap`}>{format(new Date(e.createdAt), "d MMM yyyy, h:mm a")}</td>
                        <td className={td}>{e.productName}</td>
                        <td className={`${td} font-medium`}>{e.kind === "received" ? `+${e.quantity} received` : `−${e.quantity} returned`}</td>
                        <td className={`${td} text-warm-secondary`}>{e.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {history && <PaginationBar {...history} onPageChange={setHistoryPage} isFetching={historyFetching} />}
              </div>
            </div>

            {(r.address || r.notes) && (
              <div className="text-xs text-warm-secondary space-y-1">
                {r.address && <p><strong>Address:</strong> {r.address}</p>}
                {r.notes && <p><strong>Notes:</strong> {r.notes}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>
      {r && <StockModal reseller={r} kind={stockKind} onClose={() => setStockKind(null)} />}
    </>
  );
}

// ─── overview ─────────────────────────────────────────────────────────────────
function Overview({ onOpen }: { onOpen: (id: number) => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: [KEY, "insights"], queryFn: () => apiJson<Insights>(`${KEY}/insights`) });
  if (isLoading) return <p className="text-sm text-warm-muted">Loading insights…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load insights"}</p>;
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Store} label="Active resellers" value={data.resellers.active} sub={`${data.resellers.total} in total`} />
        <StatTile icon={Boxes} label="Their units on shelf" value={t.unitsInStock} sub={`across ${t.products} products`} />
        <StatTile icon={TrendingUp} label="Units sold" value={t.unitsSold} sub={`${formatCurrency(t.revenue)} all time`} />
        <StatTile icon={IndianRupee} label="Revenue, 30 days" value={formatCurrency(t.revenueLast30d)} sub={`Our own stock: ${formatCurrency(t.ownStock.revenueLast30d)}`} />
      </div>
      {t.shareOfStoreRevenue !== null && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-forest-light border border-forest/20 text-sm text-forest-dark">
          <PieChart className="w-4 h-4 text-forest shrink-0" />
          <p><strong>{t.shareOfStoreRevenue}%</strong> of all store sales come from reseller dolls ({formatCurrency(t.revenue)} vs {formatCurrency(t.ownStock.revenue)} from our own stock).</p>
        </div>
      )}

      <UnitsChart data={monthSeries(data.monthly, 6)} title="Reseller sales, last 6 months" />

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="p-5 border-b border-warm-border">
          <h2 className="text-sm font-medium text-ink">Top resellers</h2>
          <p className="text-xs text-warm-muted">By units sold, all time</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-parchment">
              <th className={th}>#</th><th className={th}>Reseller</th><th className={th}>Sold</th><th className={th}>Revenue</th>
              <th className={th}>On shelf</th><th className={th}>Sell-through</th><th className={th}>Last sale</th>
            </tr></thead>
            <tbody>
              {data.leaderboard.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">No resellers yet.</td></tr>
              ) : data.leaderboard.map((r, i) => (
                <tr key={r.id} className="border-t border-parchment hover:bg-[#F6FBF7] cursor-pointer" onClick={() => onOpen(r.id)}>
                  <td className={`${td} text-warm-muted`}>{i + 1}</td>
                  <td className={`${td} font-medium text-ink`}>{r.name}{!r.isActive && <span className="ml-2 text-[11px] text-warm-muted">(inactive)</span>}</td>
                  <td className={`${td} font-medium`}>{r.unitsSold}</td>
                  <td className={td}>{formatCurrency(r.revenue)}</td>
                  <td className={td}>{r.unitsInStock}</td>
                  <td className={td}>{pct(r.sellThrough)}</td>
                  <td className={`${td} text-xs text-warm-muted`}>{dateOrDash(r.lastSaleAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-warm-border p-5">
          <h2 className="text-sm font-medium text-ink">Running low — ask for more</h2>
          <p className="text-xs text-warm-muted mb-3">Listed reseller dolls with fewer than 3 left</p>
          {data.restock.length === 0 ? <p className="text-sm text-warm-muted">Nothing running low.</p> : (
            <ul className="divide-y divide-parchment">
              {data.restock.map((p) => (
                <li key={p.productId} className="py-2 flex justify-between gap-3 text-sm cursor-pointer" onClick={() => onOpen(p.resellerId)}>
                  <span><span className="text-ink">{p.productName}</span> <span className="text-warm-muted text-xs">· {p.resellerName}</span></span>
                  <span className={p.available === 0 ? "text-destructive font-medium" : "text-ink"}>{p.available === 0 ? "Sold out" : `${p.available} left`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-warm-border p-5">
          <h2 className="text-sm font-medium text-ink">Slow movers — promote or return</h2>
          <p className="text-xs text-warm-muted mb-3">In stock 30+ days with no sale in the last 30 days</p>
          {data.slowMovers.length === 0 ? <p className="text-sm text-warm-muted">Everything is moving.</p> : (
            <ul className="divide-y divide-parchment">
              {data.slowMovers.map((p) => (
                <li key={p.productId} className="py-2 flex justify-between gap-3 text-sm cursor-pointer" onClick={() => onOpen(p.resellerId)}>
                  <span><span className="text-ink">{p.productName}</span> <span className="text-warm-muted text-xs">· {p.resellerName}</span></span>
                  <span className="text-warm-secondary text-xs whitespace-nowrap">{p.available} on shelf · {p.lastSaleAt ? `last sold ${dateOrDash(p.lastSaleAt)}` : "never sold"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── list ─────────────────────────────────────────────────────────────────────
function ResellerList({ onOpen, onEdit }: { onOpen: (id: number) => void; onEdit: (r: Reseller) => void }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebouncedValue(search);
  React.useEffect(() => setPage(1), [debouncedSearch, status]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: [KEY, "list", debouncedSearch, status, page],
    queryFn: () => apiJson<Page<Reseller>>(`${KEY}${queryString({ search: debouncedSearch, status, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-muted" />
          <input className={`${input} pl-10`} placeholder="Search name, contact or phone…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search resellers" />
        </div>
        <select className="px-3 py-2 rounded-lg border border-warm-border bg-white text-sm outline-none" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-parchment">
              <th className={th}>Reseller</th><th className={th}>Products</th><th className={th}>Received</th><th className={th}>Returned</th>
              <th className={th}>On shelf</th><th className={th}>Sold</th><th className={th}>Revenue</th><th className={th}>Sell-through</th>
              <th className={th}>Status</th><th className={th}>Actions</th>
            </tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-warm-muted">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-destructive">{(error as Error).message}</td></tr>
              ) : !data || data.items.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-warm-muted">{debouncedSearch || status !== "all" ? "No resellers match." : "No resellers yet. Add the first one."}</td></tr>
              ) : data.items.map((r) => (
                <tr key={r.id} className="border-t border-parchment hover:bg-[#F6FBF7] cursor-pointer" onClick={() => onOpen(r.id)}>
                  <td className={td}>
                    <p className="font-medium text-ink flex items-center gap-1.5">
                      {r.name}
                      {r.metrics.stockDifference !== 0 && <span title="Stock doesn't add up — open for details"><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /></span>}
                    </p>
                    <p className="text-xs text-warm-muted">{[r.contact, r.phone].filter(Boolean).join(" · ") || "—"}</p>
                  </td>
                  <td className={td}>{r.metrics.products}</td>
                  <td className={td}>{r.metrics.unitsReceived}</td>
                  <td className={td}>{r.metrics.unitsReturned}</td>
                  <td className={td}>{r.metrics.unitsInStock}</td>
                  <td className={`${td} font-medium`}>{r.metrics.unitsSold}</td>
                  <td className={td}>{formatCurrency(r.metrics.revenue)}</td>
                  <td className={td}>{pct(r.metrics.sellThrough)}</td>
                  <td className={td}><StatusPill active={r.isActive} /></td>
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(r)}><Edit2 className="w-4 h-4" /> Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <PaginationBar {...data} onPageChange={setPage} isFetching={isFetching} />}
      </div>
    </div>
  );
}

export function Resellers() {
  const [tab, setTab] = React.useState<"overview" | "list">("overview");
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Reseller | null>(null);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (r: Reseller) => { setEditing(r); setFormOpen(true); };
  const tabBtn = (value: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === value ? "bg-ink text-white" : "text-warm-secondary hover:bg-parchment"}`}
    >{label}</button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl text-ink">Resellers</h1>
          <p className="text-warm-secondary mt-1 text-sm">Partners who give us their dolls to sell in the app — their stock, sales and how they're doing.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add reseller</Button>
      </div>
      <div role="tablist" className="inline-flex gap-1 p-1 rounded-xl bg-white border border-warm-border">
        {tabBtn("overview", "Insights")}
        {tabBtn("list", "All resellers")}
      </div>

      {tab === "overview" ? <Overview onOpen={setOpenId} /> : <ResellerList onOpen={setOpenId} onEdit={openEdit} />}

      <ResellerDetailModal id={formOpen ? null : openId} onClose={() => setOpenId(null)} onEdit={openEdit} />
      <ResellerFormModal editing={editing} isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
