import * as React from "react";
import { useAdminStats } from "@/hooks/use-dashboard";
import { formatCurrency } from "@/lib/utils";
import { Package, ShoppingCart, IndianRupee, AlertTriangle, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { motion } from "framer-motion";

export function Dashboard() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Total Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, color: "text-gold", bg: "bg-gold/10" },
    { label: "Total Orders", value: stats.totalOrders.toString(), icon: ShoppingCart, color: "text-primary", bg: "bg-primary/10" },
    { label: "Active Products", value: stats.activeProducts.toString(), icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Low Stock Alerts", value: stats.lowStockCount.toString(), icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back. Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={card.label}
            className="glass-panel rounded-2xl p-6 flex items-start justify-between card-shadow"
          >
            <div>
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
              <h3 className="text-3xl font-display font-bold text-foreground mt-2">{card.value}</h3>
            </div>
            <div className={`p-3 rounded-xl ${card.bg}`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 card-shadow">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground">Recent Orders</h2>
            <div className="flex items-center text-sm text-primary font-medium cursor-pointer hover:underline">
              View All <TrendingUp className="w-4 h-4 ml-1" />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-lg">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg font-semibold">Order ID</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 rounded-r-lg font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order, i) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 + (i * 0.05) }}
                    key={order.id} 
                    className="border-b border-border/50 hover:bg-surface-hover transition-colors"
                  >
                    <td className="px-4 py-4 font-medium text-foreground">#{order.id}</td>
                    <td className="px-4 py-4">{order.customerName}</td>
                    <td className="px-4 py-4 text-muted-foreground">{format(new Date(order.createdAt), 'MMM dd, yyyy')}</td>
                    <td className="px-4 py-4 font-medium">{formatCurrency(order.total)}</td>
                    <td className="px-4 py-4">
                      <Badge variant={
                        order.status === 'delivered' ? 'success' :
                        order.status === 'cancelled' ? 'destructive' :
                        order.status === 'processing' ? 'warning' : 'default'
                      }>
                        {order.status}
                      </Badge>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {stats.recentOrders.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No recent orders found.</div>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 card-shadow">
          <h2 className="text-xl font-bold text-foreground mb-6">Quick Actions</h2>
          <div className="space-y-4">
             <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group">
               <h4 className="font-semibold text-primary group-hover:underline">Add New Product</h4>
               <p className="text-sm text-muted-foreground mt-1">Expand your festive catalog.</p>
             </div>
             <div className="p-4 rounded-xl border border-gold/20 bg-gold/5 hover:bg-gold/10 transition-colors cursor-pointer group">
               <h4 className="font-semibold text-gold-foreground group-hover:underline">Manage Chits</h4>
               <p className="text-sm text-muted-foreground mt-1">Review active savings plans.</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
