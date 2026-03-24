import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";
import { useCart } from "@/context/cart";

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { cart } = useCart();
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const proceedToPayment = async () => {
    if (!address.trim()) { setError("Please enter delivery address"); return; }
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/payment/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create order");
        return;
      }
      const data = await res.json();
      Haptics.selectionAsync();
      router.push({
        pathname: "/razorpay-payment",
        params: {
          razorpayOrderId: data.razorpayOrderId,
          amount: String(data.amount),
          currency: data.currency,
          keyId: data.keyId,
          name: "DollDime",
          description: "Doll Purchase",
          dbOrderId: String(data.dbOrderId),
          type: "order",
        },
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.title}>Checkout</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 120 }]}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Summary</Text>
            {cart.items.map(item => (
              <View key={item.productId} style={styles.orderItem}>
                <Text style={styles.orderItemName} numberOfLines={1}>{item.product?.name}</Text>
                <Text style={styles.orderItemQty}>×{item.quantity}</Text>
                <Text style={styles.orderItemPrice}>₹{item.subtotal?.toFixed(0)}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>₹{cart.total.toFixed(0)}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Address</Text>
            <TextInput
              style={styles.addressInput}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter your full delivery address..."
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Payment Info */}
          <View style={[styles.section, styles.paymentInfo]}>
            <View style={styles.paymentRow}>
              <Ionicons name="lock-closed" size={18} color={Colors.light.tint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle}>Secure Payment via Razorpay</Text>
                <Text style={styles.paymentSubtitle}>
                  UPI, Credit/Debit Card, Net Banking, Wallets — all supported
                </Text>
              </View>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.light.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
          <View style={styles.footerTotal}>
            <Text style={styles.footerTotalLabel}>Total Amount</Text>
            <Text style={styles.footerTotalAmount}>₹{cart.total.toFixed(0)}</Text>
          </View>
          <Pressable
            style={[styles.placeBtn, isLoading && styles.placeBtnDisabled]}
            onPress={proceedToPayment}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <Text style={styles.placeBtnText}>Pay ₹{cart.total.toFixed(0)}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.light.border },
  title: { flex: 1, textAlign: "center", fontSize: 18, color: Colors.light.text },
  content: { paddingHorizontal: 16, gap: 20 },
  section: {
    backgroundColor: "#fff", borderRadius: 20, padding: 16, gap: 12,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  paymentInfo: { gap: 0, padding: 16 },
  paymentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  paymentTitle: { fontSize: 14, color: Colors.light.text, marginBottom: 2 },
  paymentSubtitle: { fontSize: 12, color: Colors.light.textMuted, lineHeight: 18 },
  sectionTitle: { fontSize: 16, color: Colors.light.text },
  orderItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderItemName: { flex: 1, fontSize: 13, color: Colors.light.textSecondary },
  orderItemQty: { fontSize: 13, color: Colors.light.textMuted },
  orderItemPrice: { fontSize: 13, color: Colors.light.text, minWidth: 50, textAlign: "right" },
  divider: { height: 1, backgroundColor: Colors.light.border },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 15, color: Colors.light.text },
  totalAmount: { fontSize: 20, color: Colors.light.text },
  addressInput: {
    fontSize: 14, color: Colors.light.text,
    backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14,
    minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: Colors.light.border,
  },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF0EE", borderRadius: 10, padding: 12 },
  errorText: { fontSize: 13, color: Colors.light.error, flex: 1 },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: Colors.light.border,
    padding: 16, gap: 12,
  },
  footerTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerTotalLabel: { fontSize: 14, color: Colors.light.textMuted },
  footerTotalAmount: { fontSize: 22, color: Colors.light.text },
  placeBtn: {
    backgroundColor: Colors.light.tint, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  placeBtnDisabled: { opacity: 0.6 },
  placeBtnText: { fontSize: 17, color: "#fff" },
});
