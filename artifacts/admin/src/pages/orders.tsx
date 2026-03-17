import * as React from "react";
import { useOrders, useUpdateOrderStatus } from "@/hooks/use-orders";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, MapPin, CreditCard, Package } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Orders() {
  const { data: orders = [], isLoading } = useOrders();
  const updateStatusMutation = useUpdateOrderStatus();
  const [expandedRow, setExpandedRow] = React.useState<number | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const toggleRow = (id: number) => {
    setExpandedRow(prev => prev === id ? null : id);
  };

  const handleStatusChange = (id: number, newStatus: string) => {
    updateStatusMutation.mutate({ id, status: newStatus });
  };

  const statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
  
  const filteredOrders = statusFilter === "all" 
    ? orders 
    : orders.filter(o => o.status === statusFilter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'success';
      case 'cancelled': return 'destructive';
      case 'processing': 
      case 'shipped': return 'warning';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Order Management</h1>
        <p className="text-muted-foreground mt-1">Track and update customer orders.</p>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden card-shadow">
        <div className="p-4 border-b border-border/50 bg-surface-hover/50 flex overflow-x-auto hide-scrollbar gap-2">
          <button 
            onClick={() => setStatusFilter("all")}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === "all" ? "bg-primary text-white" : "bg-surface text-muted-foreground hover:bg-surface-hover border border-border"}`}
          >
            All Orders
          </button>
          {statuses.map(s => (
            <button 
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap capitalize transition-colors ${statusFilter === s ? "bg-primary text-white" : "bg-surface text-muted-foreground hover:bg-surface-hover border border-border"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr>
                <th className="px-6 py-4 font-semibold w-10"></th>
                <th className="px-6 py-4 font-semibold">Order ID</th>
                <th className="px-6 py-4 font-semibold">Customer</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Total</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading orders...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No orders found.</td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <React.Fragment key={order.id}>
                    <tr 
                      className={`border-b border-border/50 hover:bg-surface-hover/30 transition-colors cursor-pointer ${expandedRow === order.id ? 'bg-surface-hover/50' : ''}`}
                      onClick={() => toggleRow(order.id)}
                    >
                      <td className="px-6 py-4">
                        {expandedRow === order.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                      <td className="px-6 py-4 font-semibold">#{order.id}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground">User ID: {order.userId}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {format(new Date(order.createdAt), 'MMM dd, yyyy h:mm a')}
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <select 
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          disabled={updateStatusMutation.isPending}
                          className={`text-xs font-semibold rounded-full px-3 py-1.5 border-none outline-none cursor-pointer appearance-none ${
                            order.status === 'delivered' ? 'bg-success/10 text-success' :
                            order.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                            order.status === 'processing' || order.status === 'shipped' ? 'bg-warning/20 text-warning-foreground' : 
                            'bg-primary/10 text-primary'
                          }`}
                        >
                          {statuses.map(s => (
                            <option key={s} value={s} className="bg-surface text-foreground">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedRow === order.id && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-muted/10 border-b border-border"
                        >
                          <td colSpan={6} className="px-6 py-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div>
                                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                                  <Package className="w-4 h-4" /> Order Items
                                </h4>
                                <div className="space-y-3 bg-surface p-4 rounded-xl border border-border/50 shadow-sm">
                                  {order.items.map(item => (
                                    <div key={item.productId} className="flex justify-between items-center text-sm">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border border-border">
                                          {item.quantity}x
                                        </div>
                                        <span className="font-medium text-foreground">{item.productName}</span>
                                      </div>
                                      <span className="text-muted-foreground">{formatCurrency(item.subtotal)}</span>
                                    </div>
                                  ))}
                                  <div className="pt-3 mt-3 border-t border-border flex justify-between items-center font-bold">
                                    <span>Total</span>
                                    <span className="text-primary">{formatCurrency(order.total)}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="space-y-6">
                                <div>
                                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                                    <MapPin className="w-4 h-4" /> Shipping Details
                                  </h4>
                                  <div className="bg-surface p-4 rounded-xl border border-border/50 shadow-sm text-sm">
                                    {order.address ? (
                                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">{order.address}</p>
                                    ) : (
                                      <p className="text-muted-foreground italic">No address provided.</p>
                                    )}
                                  </div>
                                </div>
                                
                                <div>
                                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" /> Payment Info
                                  </h4>
                                  <div className="bg-surface p-4 rounded-xl border border-border/50 shadow-sm text-sm flex items-center gap-3">
                                    <Badge variant="outline" className="capitalize">{order.paymentMethod || 'Standard'}</Badge>
                                    <span className="text-muted-foreground">Processed on {format(new Date(order.createdAt), 'MMM dd')}</span>
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
