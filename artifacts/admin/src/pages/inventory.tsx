import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePaged } from "@/hooks/use-paged";
import { Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Package, Hash, MapPin, Info, Search } from "lucide-react";
import { formatIST } from "@/lib/time";
import { formatCurrency } from "@/lib/utils";

type Product = {
  id: number;
  name: string;
  serialNumber?: string | null;
  stock: number;
  reservedStock?: number;
  availableStock?: number;
  location?: string | null;
  imageUrl?: string | null;
  category: string;
  price: number;
  updatedAt?: string;
  createdAt?: string;
};

function useAdjustProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stock, location }: { id: number; stock: number; location?: string }) => {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock, location }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to adjust");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/products"] }),
  });
}

export function Inventory() {
  const [lowOnly, setLowOnly] = React.useState(false);
  const list = usePaged<Product>("/api/admin/products", { params: { lowStock: lowOnly ? "true" : "" }, refetchInterval: 10000 });
  const products = list.items;
  const isLoading = list.isLoading;
  const adjustMutation = useAdjustProduct();

  const [adjustTarget, setAdjustTarget] = React.useState<Product | null>(null);
  const [adjStock, setAdjStock] = React.useState(0);
  const [adjustError, setAdjustError] = React.useState("");
  const [adjLocation, setAdjLocation] = React.useState("");

  const openAdjust = (p: Product) => {
    setAdjustTarget(p);
    setAdjStock(p.stock);
    setAdjustError("");
    setAdjLocation(p.location || "");
  };

  const handleAdjust = () => {
    if (!adjustTarget) return;
    adjustMutation.mutate({ id: adjustTarget.id, stock: adjStock, location: adjLocation }, {
      onSuccess: () => { setAdjustError(""); setAdjustTarget(null); },
      onError: (e: unknown) => setAdjustError(e instanceof Error ? e.message : "Failed to adjust"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-ink">Inventory</h1>
          <p className="text-warm-secondary mt-1 text-sm">Track stock levels, locations, and serial numbers for all dolls.</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-forest-light border border-forest/20 text-sm text-forest-dark">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-forest" />
        <p>
          Products listed here are live in the mobile app. Use <strong>"Adjust"</strong> to update stock or warehouse location.
          Changes reflect immediately — no restart needed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-muted" />
          <input
            type="text"
            placeholder="Search by name, serial number or location..."
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-warm-secondary cursor-pointer">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only (fewer than 5 available)
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Image</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Product</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Serial</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Quantity</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Location</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Status</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Last Updated</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-warm-muted">No products in inventory. Add products from the Products page.</td></tr>
              ) : (
                products.map(p => (
                  <tr key={p.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3">
                      <div className="w-12 h-12 rounded-lg bg-parchment flex items-center justify-center border border-warm-border overflow-hidden">
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-warm-muted" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink text-[13px]">{p.name}</p>
                      <p className="text-xs text-warm-muted">{p.category}</p>
                    </td>
                    <td className="px-4 py-3">
                      {p.serialNumber ? (
                        <div className="flex items-center gap-1 text-warm-secondary text-xs font-mono">
                          <Hash className="w-3 h-3" />{p.serialNumber}
                        </div>
                      ) : <span className="text-warm-muted text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${(p.availableStock ?? p.stock) < 5 ? "text-destructive" : "text-ink"}`}>{p.stock}</span>
                      {(p.reservedStock ?? 0) > 0 && (
                        <p className="text-[11px] text-amber-700">{p.reservedStock} frozen while customers pay · {p.availableStock} available</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warm-secondary">
                      {p.location ? (
                        <div className="flex items-center gap-1 text-xs">
                          <MapPin className="w-3 h-3" />{p.location}
                        </div>
                      ) : <span className="text-warm-muted text-xs">Not set</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-forest-light text-forest px-2.5 py-1 rounded-full">
                        In Catalog
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-muted text-xs">
                      {formatIST(p.updatedAt ?? p.createdAt, "d/M/yyyy, h:mm a")}
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => openAdjust(p)}>Adjust</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pageSize={list.pageSize} total={list.data.total} totalPages={list.data.totalPages} onPage={list.setPage} busy={list.isFetching} />
      </div>

      <Modal
        isOpen={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={`Adjust: ${adjustTarget?.name}`}
        description="Update stock quantity and warehouse location."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Stock Quantity</label>
            <input
              type="number"
              value={adjStock}
              onChange={e => setAdjStock(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Warehouse / Location</label>
            <input
              type="text"
              value={adjLocation}
              onChange={e => setAdjLocation(e.target.value)}
              placeholder="e.g. Warehouse A, Shelf B2"
              className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
            />
          </div>
          {adjustTarget && (
            <div className="p-3 rounded-lg bg-parchment text-xs text-warm-secondary">
              Serial: {adjustTarget.serialNumber || "None"} · Current stock: {adjustTarget.stock}
              {(adjustTarget.reservedStock ?? 0) > 0 && ` · ${adjustTarget.reservedStock} frozen by customers who are paying (stock cannot go below this)`}
            </div>
          )}
          {adjustError && <p role="alert" className="text-sm text-destructive">{adjustError}</p>}
          <div className="flex justify-end gap-3 pt-4 border-t border-warm-border">
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button onClick={handleAdjust} isLoading={adjustMutation.isPending}>Save Adjustments</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
