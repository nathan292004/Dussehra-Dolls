import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Package, Hash, MapPin, Info } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

type Product = {
  id: number;
  name: string;
  serialNumber?: string | null;
  stock: number;
  location?: string | null;
  imageUrl?: string | null;
  category: string;
  price: number;
  updatedAt?: string;
  createdAt?: string;
};

function useInventory() {
  return useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
    queryFn: async () => { const res = await fetch("/api/admin/products"); return res.ok ? res.json() : []; },
    refetchInterval: 10000,
  });
}

function useAdjustProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stock, location }: { id: number; stock: number; location?: string }) => {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock, location }),
      });
      if (!res.ok) throw new Error("Failed to adjust");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/products"] }),
  });
}

export function Inventory() {
  const { data: products = [], isLoading } = useInventory();
  const adjustMutation = useAdjustProduct();

  const [adjustTarget, setAdjustTarget] = React.useState<Product | null>(null);
  const [adjStock, setAdjStock] = React.useState(0);
  const [adjLocation, setAdjLocation] = React.useState("");

  const openAdjust = (p: Product) => {
    setAdjustTarget(p);
    setAdjStock(p.stock);
    setAdjLocation(p.location || "");
  };

  const handleAdjust = () => {
    if (!adjustTarget) return;
    adjustMutation.mutate({ id: adjustTarget.id, stock: adjStock, location: adjLocation }, {
      onSuccess: () => setAdjustTarget(null),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
          <p className="text-muted-foreground mt-1">Track stock levels, locations, and serial numbers for all dolls.</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <p>
          Products listed here are live in the mobile app. Use <strong>"Adjust"</strong> to update stock or warehouse location.
          Changes reflect immediately — no restart needed.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Image</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Serial</th>
                <th className="px-4 py-3 text-left">Quantity</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Last Updated</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No products in inventory. Add products from the Products page.</td></tr>
              ) : (
                products.map(p => (
                  <tr key={p.id} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-3">
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center border border-border overflow-hidden">
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.category}</p>
                    </td>
                    <td className="px-4 py-3">
                      {p.serialNumber ? (
                        <div className="flex items-center gap-1 text-muted-foreground text-xs font-mono">
                          <Hash className="w-3 h-3" />{p.serialNumber}
                        </div>
                      ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${p.stock < 5 ? "text-destructive" : "text-foreground"}`}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.location ? (
                        <div className="flex items-center gap-1 text-xs">
                          <MapPin className="w-3 h-3" />{p.location}
                        </div>
                      ) : <span className="text-muted-foreground/40 text-xs">Not set</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-foreground text-white px-2 py-0.5 rounded">
                        In Catalog
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {p.updatedAt ? format(new Date(p.updatedAt), "d/M/yyyy") : format(new Date(p.createdAt!), "d/M/yyyy")}
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
      </div>

      {/* Adjust Modal */}
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
              className="w-full px-3 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Warehouse / Location</label>
            <input
              type="text"
              value={adjLocation}
              onChange={e => setAdjLocation(e.target.value)}
              placeholder="e.g. Warehouse A, Shelf B2"
              className="w-full px-3 py-2 rounded-lg border border-border focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            />
          </div>
          {adjustTarget && (
            <div className="p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
              Serial: {adjustTarget.serialNumber || "None"} · Current stock: {adjustTarget.stock}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button onClick={handleAdjust} isLoading={adjustMutation.isPending}>Save Adjustments</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
