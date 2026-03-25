import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";

const DEADLINE = new Date(2026, 9, 1); // October 2026

const PRESET_PLANS: { amount: number; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { amount: 5000, icon: "business-outline" },
  { amount: 10000, icon: "card-outline" },
  { amount: 15000, icon: "wallet-outline" },
];

interface MyChitEnrollment {
  id: number;
  chitPlan: {
    id: number;
    name: string;
    totalAmount: number;
    monthlyContribution: number;
    duration: number;
  };
  joinedAt: string;
  amountPaid: number;
  nextPaymentDate?: string;
  status: string;
}

function calcMaxMonths() {
  const now = new Date();
  const diff = Math.floor((DEADLINE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
  return Math.max(1, Math.min(24, diff));
}

function formatAmount(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function getPlanEndDate(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

export default function ChitsScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [myChits, setMyChits] = useState<MyChitEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Duration modal
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [duration, setDuration] = useState(3);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState("");

  // Custom amount modal
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customAmountText, setCustomAmountText] = useState("");
  const [customError, setCustomError] = useState("");

  const maxMonths = calcMaxMonths();

  const fetchMyChits = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/chits/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMyChits(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    fetchMyChits().finally(() => setIsLoading(false));
  }, [fetchMyChits]);

  const openDurationModal = (amount: number) => {
    setSelectedAmount(amount);
    setDuration(Math.min(3, maxMonths));
    setEnrollError("");
    setShowDurationModal(true);
    Haptics.selectionAsync();
  };

  const handleCustomContinue = () => {
    const v = parseFloat(customAmountText.replace(/,/g, ""));
    if (isNaN(v) || v < 1000) {
      setCustomError("Minimum amount is ₹1,000");
      return;
    }
    setCustomError("");
    setShowCustomModal(false);
    setCustomAmountText("");
    openDurationModal(v);
  };

  const handlePayEmi = async (enrollment: MyChitEnrollment) => {
    if (!user) { router.push("/auth"); return; }
    try {
      const res = await fetch(`${getApiBase()}/payment/create-chit-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enrollmentId: enrollment.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to initiate payment");
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
          description: `EMI – ${data.planName}`,
          enrollmentId: String(enrollment.id),
          type: "chit",
        },
      });
    } catch {
      alert("Network error. Please try again.");
    }
  };

  const handleEnroll = async () => {
    if (!user) { router.push("/auth"); return; }
    if (!selectedAmount) return;
    setEnrolling(true);
    setEnrollError("");
    try {
      const res = await fetch(`${getApiBase()}/chits/enroll-custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: selectedAmount, durationMonths: duration }),
      });
      if (!res.ok) {
        const err = await res.json();
        setEnrollError(err.error || "Enrollment failed");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDurationModal(false);
      await fetchMyChits();
      setTab("mine");
    } catch {
      setEnrollError("Something went wrong");
    } finally {
      setEnrolling(false);
    }
  };

  const emi = selectedAmount ? selectedAmount / duration : 0;
  const planEndDate = getPlanEndDate(duration);
  const isOverDeadline = planEndDate > DEADLINE;
  const endDateStr = planEndDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  if (isLoading) {
    return (
      <View style={[styles.loader, { paddingTop: topPad }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Chit Plans</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "browse" && styles.tabActive]}
          onPress={() => { setTab("browse"); Haptics.selectionAsync(); }}
        >
          <Text style={[styles.tabText, tab === "browse" && styles.tabTextActive]}>Browse Plans</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "mine" && styles.tabActive]}
          onPress={() => { setTab("mine"); Haptics.selectionAsync(); }}
        >
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>My Chits</Text>
          {myChits.length > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{myChits.length}</Text></View>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}>
        {tab === "browse" ? (
          <>
            {/* Info box */}
            <View style={styles.infoBox}>
              <View style={styles.infoTitle}>
                <Ionicons name="information-circle-outline" size={18} color="#1a6fd4" />
                <Text style={styles.infoTitleText}>How Chit Plans Work</Text>
              </View>
              {[
                "Choose a plan amount and duration",
                "Pay monthly installments (EMI)",
                "Each payment adds to your wallet",
                "Complete all payments to get a discount reward",
                "You can pay more than EMI to finish early",
              ].map((line, i) => (
                <Text key={i} style={styles.infoLine}>• {line}</Text>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Select Chit Plan</Text>

            {/* Preset plans */}
            {PRESET_PLANS.map(({ amount, icon }) => (
              <Pressable key={amount} style={styles.planRow} onPress={() => openDurationModal(amount)}>
                <View style={styles.planIconBox}>
                  <Ionicons name={icon} size={22} color={Colors.light.tint} />
                </View>
                <View style={styles.planRowText}>
                  <Text style={styles.planRowAmount}>{formatAmount(amount)}</Text>
                  <Text style={styles.planRowSub}>Choose duration to calculate EMI</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.light.textMuted} />
              </Pressable>
            ))}

            {/* Custom Amount */}
            <Pressable style={styles.planRow} onPress={() => { setCustomError(""); setCustomAmountText(""); setShowCustomModal(true); Haptics.selectionAsync(); }}>
              <View style={styles.planIconBox}>
                <Ionicons name="options-outline" size={22} color={Colors.light.tint} />
              </View>
              <View style={styles.planRowText}>
                <Text style={styles.planRowAmount}>Custom Amount</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.light.textMuted} />
            </Pressable>
          </>
        ) : (
          !user ? (
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={64} color={Colors.light.border} />
              <Text style={styles.emptyText}>Sign in to see your chits</Text>
              <Pressable style={styles.actionBtn} onPress={() => router.push("/auth")}>
                <Text style={styles.actionBtnText}>Sign In</Text>
              </Pressable>
            </View>
          ) : myChits.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={64} color={Colors.light.border} />
              <Text style={styles.emptyText}>No active chits</Text>
              <Text style={styles.emptySubtext}>Start saving with a chit plan</Text>
              <Pressable style={styles.actionBtn} onPress={() => setTab("browse")}>
                <Text style={styles.actionBtnText}>Browse Plans</Text>
              </Pressable>
            </View>
          ) : (
            myChits.map(e => {
              const now = new Date();
              const nextDate = e.nextPaymentDate ? new Date(e.nextPaymentDate) : null;
              const isCompleted = e.status === "completed" || e.amountPaid >= e.chitPlan.totalAmount;
              const isOverdue = !isCompleted && nextDate !== null && nextDate < now;
              const monthsCompleted = e.chitPlan.monthlyContribution > 0
                ? Math.min(e.chitPlan.duration, Math.round(e.amountPaid / e.chitPlan.monthlyContribution))
                : 0;
              const progress = e.chitPlan.totalAmount > 0
                ? Math.min(100, Math.round((e.amountPaid / e.chitPlan.totalAmount) * 100))
                : 0;
              const pillBg = isCompleted ? "#E8F0FF" : isOverdue ? "#FFF0EE" : "#E8F8EE";
              const pillColor = isCompleted ? "#2563eb" : isOverdue ? Colors.light.tint : Colors.light.success;
              const pillLabel = isCompleted ? "Completed" : isOverdue ? "Overdue" : "Active";
              const progressColor = isCompleted ? "#2563eb" : isOverdue ? Colors.light.tint : Colors.light.success;

              return (
              <View key={e.id} style={[styles.myChitCard, isOverdue && styles.myChitCardOverdue, isCompleted && styles.myChitCardCompleted]}>
                <View style={styles.myChitHeader}>
                  <Text style={styles.myChitName}>{e.chitPlan.name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
                    <Text style={[styles.statusText, { color: pillColor }]}>{pillLabel}</Text>
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` as any, backgroundColor: progressColor }]} />
                  </View>
                  <Text style={styles.progressText}>{monthsCompleted}/{e.chitPlan.duration} mo · {progress}%</Text>
                </View>

                <View style={styles.myChitStats}>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Total</Text>
                    <Text style={styles.myStatValue}>{formatAmount(e.chitPlan.totalAmount)}</Text>
                  </View>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Monthly EMI</Text>
                    <Text style={styles.myStatValue}>{formatAmount(Math.round(e.chitPlan.monthlyContribution))}</Text>
                  </View>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Paid</Text>
                    <Text style={styles.myStatValue}>{formatAmount(Math.round(e.amountPaid))}</Text>
                  </View>
                </View>

                {isOverdue && nextDate && (
                  <View style={styles.overdueRow}>
                    <Ionicons name="alert-circle" size={14} color={Colors.light.tint} />
                    <Text style={styles.overdueText}>
                      Payment was due {nextDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — please pay now
                    </Text>
                  </View>
                )}

                {!isOverdue && !isCompleted && nextDate && (
                  <View style={styles.nextPaymentRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.light.textMuted} />
                    <Text style={styles.nextPaymentText}>
                      Next payment: {nextDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                )}

                {isCompleted && (
                  <View style={styles.completedRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#2563eb" />
                    <Text style={styles.completedText}>All installments paid — plan complete!</Text>
                  </View>
                )}

                {!isCompleted && (
                  <Pressable style={[styles.payEmiBtn, isOverdue && styles.payEmiBtnOverdue]} onPress={() => handlePayEmi(e)}>
                    <Ionicons name={isOverdue ? "alert-circle" : "lock-closed"} size={16} color="#fff" />
                    <Text style={styles.payEmiBtnText}>
                      {isOverdue ? "Pay Overdue EMI – " : "Pay EMI – "}{formatAmount(Math.round(e.chitPlan.monthlyContribution))}
                    </Text>
                  </Pressable>
                )}
              </View>
              );
            })
          )
        )}
      </ScrollView>

      {/* Custom Amount Modal */}
      <Modal visible={showCustomModal} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCustomModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom Amount</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.amountInput}
                value={customAmountText}
                onChangeText={setCustomAmountText}
                placeholder="Amount (₹)"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="numeric"
                autoFocus
              />
            </View>
            <Text style={styles.minNote}>Minimum: ₹1,000</Text>
            {customError ? <Text style={styles.errorNote}>{customError}</Text> : null}
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowCustomModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={handleCustomContinue}>
                <Text style={styles.modalConfirmText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Duration Modal */}
      <Modal visible={showDurationModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !enrolling && setShowDurationModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Duration</Text>
            <Text style={styles.modalAmountLabel}>
              Amount: {selectedAmount ? formatAmount(selectedAmount) + ".00" : ""}
            </Text>

            <Text style={styles.durationLabel}>Duration (months):</Text>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={maxMonths}
              step={1}
              value={duration}
              onValueChange={(v) => setDuration(Math.round(v))}
              minimumTrackTintColor={Colors.light.tint}
              maximumTrackTintColor={Colors.light.border}
              thumbTintColor={Colors.light.tint}
            />
            <Text style={styles.durationValue}>{duration} month{duration !== 1 ? "s" : ""}</Text>

            {/* EMI box */}
            <View style={styles.emiBox}>
              <View style={styles.emiTitleRow}>
                <Ionicons name="information-circle-outline" size={15} color="#1a6fd4" />
                <Text style={styles.emiTitle}>Monthly EMI</Text>
              </View>
              <Text style={styles.emiAmount}>{formatAmount(Math.round(emi))}</Text>
            </View>

            {/* Deadline warning */}
            <View style={[styles.deadlineBox, isOverDeadline && styles.deadlineBoxError]}>
              <Ionicons
                name={isOverDeadline ? "alert-circle-outline" : "warning-outline"}
                size={15}
                color={isOverDeadline ? Colors.light.error : "#b45309"}
              />
              <Text style={[styles.deadlineText, isOverDeadline && styles.deadlineTextError]}>
                {isOverDeadline
                  ? `Plan ends ${endDateStr}, which is after October 2026`
                  : `Plan must end before October 2026`}
              </Text>
            </View>

            {enrollError ? <Text style={styles.errorNote}>{enrollError}</Text> : null}

            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowDurationModal(false)} disabled={enrolling}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, (enrolling || isOverDeadline) && { opacity: 0.6 }]}
                onPress={handleEnroll}
                disabled={enrolling || isOverDeadline}
              >
                {enrolling ? (
                  <ActivityIndicator size="small" color={Colors.light.tint} />
                ) : (
                  <Text style={styles.modalConfirmText}>Enroll</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  header: { paddingHorizontal: 20, paddingBottom: 10 },
  title: { fontSize: 26, color: Colors.light.text },
  tabs: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 16,
    backgroundColor: Colors.light.surface, borderRadius: 12, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10, flexDirection: "row", justifyContent: "center", gap: 6 },
  tabActive: { backgroundColor: "#fff", shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, color: Colors.light.textMuted },
  tabTextActive: { color: Colors.light.text },
  badge: { backgroundColor: Colors.light.tint, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center" },
  badgeText: { color: "#fff", fontSize: 11 },
  content: { paddingHorizontal: 16, gap: 12 },
  infoBox: {
    backgroundColor: "#EAF3FF", borderRadius: 14, padding: 16, gap: 6,
    borderWidth: 1, borderColor: "#C3D9F5",
  },
  infoTitle: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  infoTitleText: { fontSize: 14, color: "#1a6fd4" },
  infoLine: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 20 },
  sectionLabel: { fontSize: 18, color: Colors.light.text, marginTop: 4 },
  planRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: 14, padding: 16,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  planIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.light.tint + "18", alignItems: "center", justifyContent: "center",
  },
  planRowText: { flex: 1 },
  planRowAmount: { fontSize: 17, color: Colors.light.text },
  planRowSub: { fontSize: 12, color: Colors.light.textMuted, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 18, color: Colors.light.text },
  emptySubtext: { fontSize: 13, color: Colors.light.textMuted, textAlign: "center" },
  actionBtn: { backgroundColor: Colors.light.tint, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, marginTop: 4 },
  actionBtnText: { fontSize: 15, color: "#fff" },
  myChitCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 12,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  myChitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  myChitName: { fontSize: 15, color: Colors.light.text, flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12 },
  myChitStats: { flexDirection: "row", justifyContent: "space-between" },
  myStatItem: { alignItems: "center" },
  myStatLabel: { fontSize: 11, color: Colors.light.textMuted },
  myStatValue: { fontSize: 14, color: Colors.light.text },
  nextPaymentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nextPaymentText: { fontSize: 12, color: Colors.light.textMuted },
  payEmiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.light.tint, borderRadius: 12, paddingVertical: 12,
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
  },
  payEmiBtnText: { fontSize: 15, color: "#fff" },
  payEmiBtnOverdue: { backgroundColor: Colors.light.tint },
  myChitCardOverdue: { borderWidth: 1.5, borderColor: Colors.light.tint + "60" },
  myChitCardCompleted: { borderWidth: 1.5, borderColor: "#2563eb40" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressBarBg: { flex: 1, height: 5, borderRadius: 999, backgroundColor: "#e5e7eb", overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 999 },
  progressText: { fontSize: 11, color: Colors.light.textMuted, minWidth: 90, textAlign: "right" },
  overdueRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#FFF0EE", borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: "#FCCFC9",
  },
  overdueText: { fontSize: 12, color: Colors.light.tint, flex: 1, lineHeight: 17 },
  completedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  completedText: { fontSize: 12, color: "#2563eb" },
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 24,
    width: "100%", maxWidth: 360, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  modalTitle: { fontSize: 20, color: Colors.light.text },
  modalAmountLabel: { fontSize: 14, color: Colors.light.textSecondary },
  inputWrap: {
    borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  amountInput: { fontSize: 16, color: Colors.light.text },
  minNote: { fontSize: 12, color: Colors.light.textMuted, textAlign: "center" },
  errorNote: { fontSize: 13, color: Colors.light.error, textAlign: "center" },
  durationLabel: { fontSize: 13, color: Colors.light.textSecondary },
  slider: { width: "100%", height: 40 },
  durationValue: { fontSize: 20, color: Colors.light.text },
  emiBox: {
    backgroundColor: "#EAF3FF", borderRadius: 12, padding: 12, gap: 4,
    borderWidth: 1, borderColor: "#C3D9F5",
  },
  emiTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  emiTitle: { fontSize: 13, color: "#1a6fd4" },
  emiAmount: { fontSize: 24, color: "#1a6fd4" },
  deadlineBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FFFBEB", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  deadlineBoxError: { backgroundColor: "#FFF0EE", borderColor: "#FCCFC9" },
  deadlineText: { fontSize: 12, color: "#b45309", flex: 1 },
  deadlineTextError: { color: Colors.light.error },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12 },
  modalCancelText: { fontSize: 16, color: Colors.light.tint },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12,
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.light.tint,
  },
  modalConfirmText: { fontSize: 16, color: Colors.light.tint },
});
