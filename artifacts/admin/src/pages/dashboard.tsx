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
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
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
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back. Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-xl border border-border p-5 shadow-sm"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="text-4xl font-bold text-foreground mt-1">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-2">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left rounded-l-lg">Order ID</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                  <th className="px-3 py-2 text-left rounded-r-lg">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map(order => (
                  <tr key={order.id} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="px-3 py-3 text-xs font-mono text-muted-foreground">#{order.id}</td>
                    <td className="px-3 py-3 font-medium">{order.customerName}</td>
                    <td className="px-3 py-3">{formatCurrency(order.total)}</td>
                    <td className="px-3 py-3">
                      <Badge variant={
                        order.status === "delivered" ? "success" :
                        order.status === "cancelled" ? "destructive" :
                        order.status === "shipped" || order.status === "processing" ? "warning" : "default"
                      }>{order.status}</Badge>
                    </td>
                  </tr>
                ))}
                {stats.recentOrders.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border shadow-sm p-5 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Quick Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Total Revenue</span>
              <span className="font-semibold">{formatCurrency(stats.totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Low Stock Items</span>
              <span className={`font-semibold ${stats.lowStockCount > 0 ? "text-destructive" : "text-green-600"}`}>{stats.lowStockCount}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Active Users</span>
              <span className="font-semibold">{stats.totalUsers}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
