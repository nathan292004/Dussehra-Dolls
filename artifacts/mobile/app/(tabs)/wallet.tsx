import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";

interface Transaction {
  id: number;
  type: "credit" | "debit";
  amount: number;
  description: string;
  createdAt: string;
}

interface WalletData {
  balance: number;
  transactions: Transaction[];
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [adding, setAdding] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchWallet = useCallback(async () => {
    if (!token) { setIsLoading(false); return; }
    try {
      const res = await fetch(`${getApiBase()}/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setWallet(await res.json());
    } catch { /* ignore */ } finally { setIsLoading(false); }
  }, [token]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const addFunds = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    setAdding(true);
    try {
      const res = await fetch(`${getApiBase()}/payment/create-wallet-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to initiate payment");
        return;
      }
      const data = await res.json();
      Haptics.selectionAsync();
      setShowAddModal(false);
      setAmount("");
      router.push({
        pathname: "/razorpay-payment",
        params: {
          razorpayOrderId: data.razorpayOrderId,
          amount: String(data.amount),
          currency: data.currency,
          keyId: data.keyId,
          name: "DollDime",
          description: `Add ₹${amt.toFixed(0)} to Wallet`,
          type: "wallet",
        },
      });
    } catch { alert("Network error. Please try again."); } finally { setAdding(false); }
  };

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.title}>Wallet</Text>
        <View style={styles.empty}>
          <Ionicons name="wallet-outline" size={64} color={Colors.light.border} />
          <Text style={styles.emptyText}>Sign in to access wallet</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth")}>
            <Text style={styles.btnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.loader, { paddingTop: topPad }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 90 }]}>
        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Ionicons name="shield-checkmark" size={18} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.balanceAmount}>₹{(wallet?.balance ?? 0).toFixed(2)}</Text>
          <View style={styles.balanceActions}>
            <Pressable
              style={styles.addFundsBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAddModal(true); }}
            >
              <Ionicons name="add" size={16} color={Colors.light.tint} />
              <Text style={styles.addFundsBtnText}>Add Money</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Transaction History</Text>

        {!wallet?.transactions.length ? (
          <View style={styles.emptyTx}>
            <Ionicons name="receipt-outline" size={48} color={Colors.light.border} />
            <Text style={styles.emptyTxText}>No transactions yet</Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {wallet.transactions.map(tx => (
              <View key={tx.id} style={styles.txItem}>
                <View style={[styles.txIcon, { backgroundColor: tx.type === "credit" ? "#E8F8EE" : "#FFF0EE" }]}>
                  <Ionicons
                    name={tx.type === "credit" ? "arrow-down" : "arrow-up"}
                    size={18}
                    color={tx.type === "credit" ? Colors.light.success : Colors.light.error}
                  />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txDesc}>{tx.description}</Text>
                  <Text style={styles.txDate}>
                    {new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: tx.type === "credit" ? Colors.light.success : Colors.light.error }]}>
                  {tx.type === "credit" ? "+" : "-"}₹{tx.amount.toFixed(0)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
          <View style={[styles.modalSheet, { paddingBottom: bottomPad + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Money</Text>
            <Text style={styles.modalSubtitle}>Enter amount to add to your wallet</Text>
            <View style={styles.quickAmounts}>
              {QUICK_AMOUNTS.map(amt => (
                <Pressable
                  key={amt}
                  style={[styles.quickBtn, amount === String(amt) && styles.quickBtnActive]}
                  onPress={() => { setAmount(String(amt)); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.quickBtnText, amount === String(amt) && styles.quickBtnTextActive]}>
                    ₹{amt}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="Enter custom amount"
              placeholderTextColor={Colors.light.textMuted}
            />
            <Pressable
              style={[styles.addBtn, (!amount || adding) && styles.addBtnDisabled]}
              onPress={addFunds}
              disabled={!amount || adding}
            >
              {adding
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.addBtnText}>Pay ₹{amount || "0"} via Razorpay</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 26, color: Colors.light.text },
  content: { paddingHorizontal: 16, gap: 20 },
  balanceCard: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: Colors.light.tint,
    gap: 8,
    shadowColor: Colors.light.tint,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  balanceAmount: { fontSize: 40, color: "#fff", letterSpacing: -1 },
  balanceActions: { marginTop: 8 },
  addFundsBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    alignSelf: "flex-start",
  },
  addFundsBtnText: { fontSize: 14, color: Colors.light.tint },
  sectionTitle: { fontSize: 18, color: Colors.light.text },
  txList: { gap: 0, backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: Colors.light.border },
  txItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, color: Colors.light.text },
  txDate: { fontSize: 12, color: Colors.light.textMuted, marginTop: 2 },
  txAmount: { fontSize: 15, },
  emptyTx: { alignItems: "center", gap: 12, paddingVertical: 40 },
  emptyTxText: { fontSize: 15, color: Colors.light.textMuted },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 100 },
  emptyText: { fontSize: 18, color: Colors.light.text },
  btn: { backgroundColor: Colors.light.tint, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  btnText: { fontSize: 15, color: "#fff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 16,
  },
  modalHandle: { width: 36, height: 4, backgroundColor: Colors.light.border, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 22, color: Colors.light.text },
  modalSubtitle: { fontSize: 14, color: Colors.light.textMuted },
  quickAmounts: { flexDirection: "row", gap: 10 },
  quickBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center",
    backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border,
  },
  quickBtnActive: { backgroundColor: Colors.light.cream, borderColor: Colors.light.tint },
  quickBtnText: { fontSize: 14, color: Colors.light.textSecondary },
  quickBtnTextActive: { color: Colors.light.tint },
  amountInput: {
    borderWidth: 1, borderColor: Colors.light.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 18,
  },
  addBtn: { backgroundColor: Colors.light.tint, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontSize: 16, color: "#fff" },
});
