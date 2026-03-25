import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";

const STATUS_STEPS = ["pending", "confirmed", "processing", "shipped", "delivered"];

interface Order {
  id: number;
  status: string;
  items: Array<{ productId: number; productName: string; quantity: number; price: number; subtotal: number }>;
  total: number;
  address?: string;
  paymentMethod?: string;
  createdAt: string;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setOrder(await res.json());
      } catch { /* ignore */ } finally { setIsLoading(false); }
    })();
  }, [id, token]);

  const currentStep = STATUS_STEPS.indexOf(order?.status || "pending");

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loader}>
        <Text style={styles.errorText}>Order not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.push("/(tabs)/")}>
          <Ionicons name="arrow-back" size={20} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Order #{order.id}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>
          <Text style={styles.successTitle}>Order Placed!</Text>
          <Text style={styles.successSubtitle}>Your festive dolls are on their way</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Status</Text>
          <View style={styles.statusTracker}>
            {STATUS_STEPS.map((step, index) => {
              const isCompleted = index <= currentStep;
              const isActive = index === currentStep;
              return (
                <View key={step} style={styles.stepRow}>
                  <View style={styles.stepLeft}>
                    <View style={[styles.stepDot, isCompleted && styles.stepDotActive, isActive && styles.stepDotCurrent]}>
                      {isCompleted ? (
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      ) : null}
                    </View>
                    {index < STATUS_STEPS.length - 1 && (
                      <View style={[styles.stepLine, isCompleted && index < currentStep && styles.stepLineActive]} />
                    )}
                  </View>
                  <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                    {step.charAt(0).toUpperCase() + step.slice(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items Ordered</Text>
          {order.items.map((item, i) => (
            <View key={i} style={styles.orderItem}>
              <View style={styles.itemIconContainer}>
                <Ionicons name="cube-outline" size={20} color={Colors.light.tint} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.productName}</Text>
                <Text style={styles.itemMeta}>Qty: {item.quantity} × ₹{item.price.toFixed(0)}</Text>
              </View>
              <Text style={styles.itemSubtotal}>₹{item.subtotal.toFixed(0)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <Text style={styles.totalAmount}>₹{order.total.toFixed(0)}</Text>
          </View>
        </View>

        {(order.address || order.paymentMethod) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Details</Text>
            {order.address && (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={16} color={Colors.light.tint} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>Delivery Address</Text>
                  <Text style={styles.detailValue}>{order.address}</Text>
                </View>
              </View>
            )}
            {order.paymentMethod && (
              <View style={styles.detailRow}>
                <Ionicons name="card-outline" size={16} color={Colors.light.tint} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>Payment Method</Text>
                  <Text style={styles.detailValue}>{order.paymentMethod}</Text>
                </View>
              </View>
            )}
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={16} color={Colors.light.tint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Order Date</Text>
                <Text style={styles.detailValue}>
                  {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Pressable style={styles.shopBtn} onPress={() => router.push("/(tabs)/")}>
          <Ionicons name="storefront-outline" size={20} color="#fff" />
          <Text style={styles.shopBtnText}>Continue Shopping</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  errorText: { fontSize: 16, color: Colors.light.textMuted },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.light.border },
  title: { flex: 1, textAlign: "center", fontSize: 18, color: Colors.light.text },
  content: { paddingHorizontal: 16, gap: 16 },
  successCard: {
    backgroundColor: Colors.light.tint, borderRadius: 24, padding: 32,
    alignItems: "center", gap: 8,
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, color: "#fff" },
  successSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.85)" },
  section: {
    backgroundColor: "#fff", borderRadius: 20, padding: 16, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  sectionTitle: { fontSize: 16, color: Colors.light.text },
  statusTracker: { gap: 0, paddingLeft: 4 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 16, minHeight: 44 },
  stepLeft: { alignItems: "center", width: 22 },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.light.border, alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: Colors.light.tint },
  stepDotCurrent: { backgroundColor: Colors.light.tint, shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  stepLine: { width: 2, flex: 1, backgroundColor: Colors.light.border, marginVertical: 3 },
  stepLineActive: { backgroundColor: Colors.light.tint },
  stepLabel: { fontSize: 14, color: Colors.light.textMuted, paddingTop: 2 },
  stepLabelActive: { color: Colors.light.tint, },
  orderItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemIconContainer: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.light.cream, alignItems: "center", justifyContent: "center" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, color: Colors.light.text },
  itemMeta: { fontSize: 12, color: Colors.light.textMuted },
  itemSubtotal: { fontSize: 14, color: Colors.light.text },
  divider: { height: 1, backgroundColor: Colors.light.border },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 15, color: Colors.light.text },
  totalAmount: { fontSize: 22, color: Colors.light.text },
  detailRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  detailLabel: { fontSize: 12, color: Colors.light.textMuted },
  detailValue: { fontSize: 14, color: Colors.light.text, marginTop: 2 },
  shopBtn: {
    backgroundColor: Colors.light.tint, borderRadius: 16, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  shopBtnText: { fontSize: 16, color: "#fff" },
});
