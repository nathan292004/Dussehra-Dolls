import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";
import { useRefreshControl } from "@/hooks/use-refresh-control";
import { formatDateIST } from "@/lib/time";

const STATUS_COLORS: Record<string, string> = {
  pending: "#F39C12",
  confirmed: Colors.light.tint,
  processing: "#9B59B6",
  shipped: "#3498DB",
  delivered: "#27AE60",
  cancelled: "#E74C3C",
};

const PAGE_SIZE = 20;

interface Order {
  id: number;
  status: string;
  items: Array<{ productName: string; quantity: number }>;
  total: number;
  createdAt: string;
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Orders come 20 at a time, newest first; scrolling down loads older ones.
  const loadPage = useCallback(async (pageToLoad: number) => {
    if (!token) { setIsLoading(false); return; }
    try {
      const res = await fetch(`${getApiBase()}/orders?page=${pageToLoad}&pageSize=${PAGE_SIZE}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const body: { items: Order[]; page: number; totalPages: number } = await res.json();
      setOrders(prev => {
        if (pageToLoad === 1) return body.items;
        const seen = new Set(prev.map(o => o.id));
        return [...prev, ...body.items.filter(o => !seen.has(o.id))];
      });
      setPage(body.page);
      setTotalPages(body.totalPages);
    } catch { /* ignore */ } finally { setIsLoading(false); setLoadingMore(false); }
  }, [token]);

  useEffect(() => { void loadPage(1); }, [loadPage]);
  const refreshControl = useRefreshControl(() => loadPage(1));

  const loadMore = () => {
    if (loadingMore || isLoading || page >= totalPages) return;
    setLoadingMore(true);
    void loadPage(page + 1);
  };

  if (isLoading) return <View style={[styles.loader, { paddingTop: topPad }]}><ActivityIndicator size="large" color={Colors.light.tint} /></View>;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>My Orders</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        refreshControl={refreshControl}
        data={orders}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 20, gap: 12 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} color={Colors.light.tint} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bag-outline" size={64} color={Colors.light.border} />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Pressable style={styles.shopBtn} onPress={() => router.push("/(tabs)")}>
              <Text style={styles.shopBtnText}>Start Shopping</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.orderCard}
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: item.id } })}
          >
            <View style={styles.orderHeader}>
              <Text style={styles.orderId}>Order #{item.id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || "#666") + "18" }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || "#666" }]}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Text>
              </View>
            </View>
            <Text style={styles.orderItems} numberOfLines={1}>
              {item.items.map(i => `${i.productName} ×${i.quantity}`).join(", ")}
            </Text>
            <View style={styles.orderFooter}>
              <Text style={styles.orderDate}>
                {formatDateIST(item.createdAt)}
              </Text>
              <Text style={styles.orderTotal}>₹{item.total.toFixed(0)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.light.border },
  title: { flex: 1, textAlign: "center", fontSize: 18, color: Colors.light.text },
  orderCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontSize: 15, color: Colors.light.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, },
  orderItems: { fontSize: 13, color: Colors.light.textSecondary },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderDate: { fontSize: 12, color: Colors.light.textMuted },
  orderTotal: { fontSize: 16, color: Colors.light.text },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 16 },
  emptyTitle: { fontSize: 18, color: Colors.light.text },
  shopBtn: { backgroundColor: Colors.light.tint, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  shopBtnText: { fontSize: 15, color: "#fff" },
});
