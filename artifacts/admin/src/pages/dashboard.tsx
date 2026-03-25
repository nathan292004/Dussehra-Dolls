import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { ShoppingCart, Package, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { motion } from "framer-motion";

type RecentOrder = { id: number; userId: number; customerName: string; total: number; status: string; createdAt: string };
type AdminStats = {
  totalOrders: number;
  totalRevenue: number;
  activeProducts: number;
  lowStockCount: number;
  totalUsers: number;
  totalWallets: number;
  recentOrders: RecentOrder[];
};

function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) return { totalOrders: 0, totalRevenue: 0, activeProducts: 0, lowStockCount: 0, totalUsers: 0, totalWallets: 0, recentOrders: [] };
      return res.json();
    },
    refetchInterval: 15000,
  });
}

export function Dashboard() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-forest" />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Total Orders", value: stats.totalOrders, sub: "All time orders", icon: ShoppingCart },
    { label: "Total Products", value: stats.activeProducts, sub: "Active products", icon: Package },
    { label: "Total Users", value: stats.totalUsers, sub: "Registered users", icon: Users },
    { label: "Total Wallets", value: stats.totalWallets, sub: "Active wallets", icon: Wallet },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl text-ink">Dashboard</h1>
        <p className="text-warm-secondary mt-1 text-sm">Welcome back. Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-2xl border border-warm-border p-5"
          >
            <div className="flex justify-between items-start mb-3">
              <p className="text-xs text-warm-muted uppercase tracking-wider">{card.label}</p>
              <div className="w-10 h-10 rounded-[10px] bg-forest-light flex items-center justify-center">
                <card.icon className="h-[18px] w-[18px] text-forest" />
              </div>
            </div>
            <p className="text-4xl font-display text-ink" style={{ fontWeight: 700 }}>{card.value}</p>
            <p className="text-xs text-warm-muted mt-2">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
          <div className="p-5 border-b border-warm-border">
            <h2 className="text-lg font-display text-ink" style={{ fontWeight: 600 }}>Recent Orders</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-parchment">
                  <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Order ID</th>
                  <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Customer</th>
                  <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Amount</th>
                  <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map(order => (
                  <tr key={order.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-warm-muted">#{order.id}</td>
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">{order.customerName}</td>
                    <td className="px-4 py-3 font-display text-ink text-[13px]" style={{ fontWeight: 600 }}>{formatCurrency(order.total)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={
                        order.status === "delivered" ? "success" :
                        order.status === "cancelled" ? "destructive" :
                        order.status === "shipped" || order.status === "processing" ? "warning" : "default"
                      }>{order.status}</Badge>
                    </td>
                  </tr>
                ))}
                {stats.recentOrders.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-warm-muted">No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-warm-border p-5 space-y-4">
          <h2 className="text-lg font-display text-ink" style={{ fontWeight: 600 }}>Quick Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 border-b border-parchment">
              <span className="text-sm text-warm-secondary">Total Revenue</span>
              <span className="font-display text-ink" style={{ fontWeight: 600 }}>{formatCurrency(stats.totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-parchment">
              <span className="text-sm text-warm-secondary">Low Stock Items</span>
              <span className={`font-semibold ${stats.lowStockCount > 0 ? "text-destructive" : "text-forest"}`}>{stats.lowStockCount}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-sm text-warm-secondary">Active Users</span>
              <span className="font-semibold text-ink">{stats.totalUsers}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
