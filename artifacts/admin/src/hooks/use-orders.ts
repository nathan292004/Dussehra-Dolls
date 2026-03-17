import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const orderItemSchema = z.object({
  productId: z.number(),
  productName: z.string(),
  quantity: z.number(),
  price: z.coerce.number(),
  subtotal: z.coerce.number(),
});

export const orderSchema = z.object({
  id: z.number(),
  userId: z.number(),
  customerName: z.string().optional().default("Unknown Customer"),
  items: z.array(orderItemSchema),
  total: z.coerce.number(),
  status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]),
  address: z.string().optional(),
  paymentMethod: z.string().optional(),
  createdAt: z.string(),
});

export type Order = z.infer<typeof orderSchema>;

export function useOrders() {
  return useQuery({
    queryKey: ["/api/admin/orders"],
    queryFn: async () => {
      const res = await fetch("/api/admin/orders");
      if (!res.ok) {
         console.warn("Orders API failed, returning empty array");
         return [] as Order[];
      }
      const data = await res.json();
      return z.array(orderSchema).parse(data);
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update order status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });
}
