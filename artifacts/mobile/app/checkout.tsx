import React, { useState, useCallback } from "react";
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
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";
import { useCart } from "@/context/cart";
import { useRefreshControl } from "@/hooks/use-refresh-control";
import type { SavedAddress } from "@/app/addresses";

// Mirrors the server: the wallet pays first, but the part left for the online payment must be at least ₹1.
function walletShare(spendablePaise: number, totalPaise: number) {
  let share = Math.min(Math.max(spendablePaise, 0), totalPaise);
  const remainder = totalPaise - share;
  if (remainder > 0 && remainder < 100 && totalPaise >= 100) share = totalPaise - 100;
  return Math.max(0, share);
}

const inr = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { cart, fetchCart } = useCart();
  const [wallet, setWallet] = useState<{ balance: number; lockedBalance: number; isReleased: boolean } | null>(null);
  const [useWallet, setUseWallet] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const loadWallet = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/wallet`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setWallet({ balance: data.balance ?? 0, lockedBalance: data.lockedBalance ?? 0, isReleased: data.isReleased !== false });
      }
    } catch { /* checkout still works without the wallet */ }
  }, [token]);

  const loadAddresses = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/addresses`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const rows: SavedAddress[] = data?.addresses || [];
      setSavedAddresses(rows);
      // Keep the chosen address if it still exists, otherwise use the default (or the first) one.
      setAddressId((current) => {
        if (current && rows.some((r) => r.id === current)) return current;
        return (rows.find((item) => item.isDefault) ?? rows[0])?.id ?? null;
      });
    } catch { /* checkout still works without saved addresses */ }
  }, [token]);

  useFocusEffect(useCallback(() => { void loadWallet(); void loadAddresses(); }, [loadWallet, loadAddresses]));
  const refreshControl = useRefreshControl(() => Promise.all([loadWallet(), loadAddresses(), fetchCart()]));

  const totalPaise = Math.round(cart.total * 100);
  const spendablePaise = Math.round((wallet?.balance ?? 0) * 100);
  const lockedPaise = Math.round((wallet?.lockedBalance ?? 0) * 100);
  // The wallet opens only after the last chit payment (is_released), so it cannot be used before that.
  const walletLocked = wallet?.isReleased === false;
  const walletPaise = useWallet && !walletLocked ? walletShare(spendablePaise, totalPaise) : 0;
  const onlinePaise = totalPaise - walletPaise;

  const proceedToPayment = async () => {
    if (!addressId) { setError("Add a delivery address to continue"); return; }
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/payment/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ addressId, useWallet: walletPaise > 0 }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create order");
        void loadWallet();
        // Something ran out of stock (or changed): refresh the cart so it shows what can still be bought.
        if (err.code === "OUT_OF_STOCK") await fetchCart();
        if (err.code === "ADDRESS_REQUIRED") void loadAddresses();
        return;
      }
      const data = await res.json();
      if (data.paidByWallet) {
        // The wallet covered everything: the order is already confirmed.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await fetchCart();
        router.replace({ pathname: "/order/[id]", params: { id: String(data.orderId) } });
        return;
      }
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

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 190 }]} refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
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
            <View style={styles.addressHeader}>
              <Text style={styles.sectionTitle}>Delivery Address</Text>
              <Pressable onPress={() => router.push("/addresses")} hitSlop={8}>
                <Text style={styles.manageLink}>{savedAddresses.length ? "Manage" : "Add address"}</Text>
              </Pressable>
            </View>
            {savedAddresses.length ? savedAddresses.map(saved => (
              <Pressable key={saved.id} style={[styles.addressOption, addressId === saved.id && styles.addressOptionSelected]}
                onPress={() => { setAddressId(saved.id); setError(""); Haptics.selectionAsync(); }}>
                <Ionicons name={addressId === saved.id ? "radio-button-on" : "radio-button-off"} size={20} color={Colors.light.tint} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.savedAddressLabel}>{saved.label}{saved.isDefault ? " · Default" : ""} · {saved.recipientName}</Text>
                  <Text style={styles.savedAddressValue}>{saved.formattedAddress}</Text>
                  <Text style={styles.mapHelp}>{saved.phone}</Text>
                </View>
              </Pressable>
            )) : (
              <Pressable style={styles.mapToggle} onPress={() => router.push("/addresses")}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.light.tint} />
                <Text style={styles.mapToggleText}>Add your delivery address (flat number, locality, map pin)</Text>
              </Pressable>
            )}
          </View>

          {wallet && walletLocked && spendablePaise > 0 ? (
            <View style={styles.lockedNote}>
              <Ionicons name="lock-closed-outline" size={16} color="#b45309" />
              <Text style={styles.lockedNoteText}>
                Your wallet ({inr(spendablePaise)}) opens after your last chit payment in August. For now, pay online.
              </Text>
            </View>
          ) : null}

          {wallet && !walletLocked && spendablePaise > 0 ? (
            <View style={styles.section}>
              <View style={styles.walletHeader}>
                <Ionicons name="wallet-outline" size={20} color={Colors.light.tint} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentTitle}>Pay with wallet</Text>
                  <Text style={styles.paymentSubtitle}>Available balance {inr(spendablePaise)}</Text>
                </View>
                <Switch
                  value={useWallet}
                  onValueChange={(v) => { Haptics.selectionAsync(); setUseWallet(v); }}
                  trackColor={{ true: Colors.light.tint, false: Colors.light.border }}
                />
              </View>
              {useWallet ? (
                <View style={styles.splitBox}>
                  <View style={styles.splitRow}>
                    <Text style={styles.splitLabel}>From wallet</Text>
                    <Text style={styles.splitValue}>− {inr(walletPaise)}</Text>
                  </View>
                  <View style={styles.splitRow}>
                    <Text style={styles.splitLabel}>{onlinePaise > 0 ? "Pay online" : "To pay"}</Text>
                    <Text style={[styles.splitValue, { fontWeight: "700" }]}>{inr(onlinePaise)}</Text>
                  </View>
                  <Text style={styles.splitNote}>
                    {onlinePaise > 0
                      ? "Your wallet does not cover the full amount, so you pay the rest online."
                      : "Your wallet covers the whole order. No online payment needed."}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {wallet && lockedPaise > 0 ? (
            <View style={styles.lockedNote}>
              <Ionicons name="lock-closed-outline" size={16} color="#b45309" />
              <Text style={styles.lockedNoteText}>
                {inr(lockedPaise)} saved in your chit plans cannot be used until the plan completes in August.
              </Text>
            </View>
          ) : null}

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
            <Text style={styles.footerTotalLabel}>{walletPaise > 0 ? "To pay now" : "Total Amount"}</Text>
            <Text style={styles.footerTotalAmount}>{inr(onlinePaise)}</Text>
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
                <Ionicons name={onlinePaise === 0 ? "wallet-outline" : "lock-closed"} size={18} color="#fff" />
                <Text style={styles.placeBtnText}>
                  {onlinePaise === 0 ? `Place Order · ${inr(totalPaise)} from wallet` : `Pay ${inr(onlinePaise)}`}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  addressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  manageLink: { color: Colors.light.tint, fontSize: 13, fontWeight: "600" },
  addressOption: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  addressOptionSelected: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tintLight },
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.light.border },
  title: { flex: 1, textAlign: "center", fontSize: 18, color: Colors.light.text },
  content: { paddingHorizontal: 16, gap: 20 },
  section: {
    backgroundColor: "#fff", borderRadius: 20, padding: 16, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  paymentInfo: { gap: 0, padding: 16 },
  walletHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  splitBox: { backgroundColor: Colors.light.tintLight, borderRadius: 12, padding: 12, gap: 6 },
  splitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  splitLabel: { fontSize: 13, color: Colors.light.textSecondary },
  splitValue: { fontSize: 15, color: Colors.light.text },
  splitNote: { fontSize: 12, color: "#3B6D11", marginTop: 2, lineHeight: 17 },
  lockedNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  lockedNoteText: { fontSize: 12, color: "#b45309", flex: 1, lineHeight: 17 },
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
  savedAddresses: { gap: 8, paddingBottom: 2 },
  savedAddress: { width: 210, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, gap: 5 },
  savedAddressSelected: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tintLight },
  savedAddressLabel: { color: Colors.light.text, fontWeight: "600", fontSize: 12 },
  savedAddressValue: { color: Colors.light.textMuted, fontSize: 11, lineHeight: 15 },
  mapToggle: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.light.tintLight },
  mapToggleText: { flex: 1, color: Colors.light.tint, fontSize: 13, fontWeight: "600" },
  pinConfirmation: { flexDirection: "row", alignItems: "center", gap: 6 },
  pinText: { color: Colors.light.tint, fontSize: 11, flex: 1 },
  mapHelp: { color: Colors.light.textMuted, fontSize: 11 },
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
  balanceBtn: { borderWidth: 1.5, borderColor: Colors.light.tint, borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  balanceBtnText: { color: Colors.light.tint, fontSize: 16 },
});
