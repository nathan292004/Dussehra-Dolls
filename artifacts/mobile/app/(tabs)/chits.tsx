import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";
import {
  CHIT_VALUE,
  CHIT_DURATION_MONTHS,
  CHIT_BONUS_PERCENT,
  MIN_CHITS,
  MAX_CHITS,
  QUICK_PICK_CHITS,
  chitPlanFigures,
} from "@/constants/chit";

interface ChitPlan {
  id: number;
  name: string;
  chits: number;
  monthlyAmount: number;
  totalAmount: number;
  bonusPoints: number;
  durationMonths: number;
  cycleStartYear: number;
  cycleLabel: string;
  amountPaid: number;
  // under_review -> (admin approves) -> active -> completed, or rejected
  reviewStatus: "under_review" | "rejected" | "active" | "completed";
  rejectionReason: string | null;
  monthsDue: number;
  dueToDate: number;
  outstanding: number;
  monthsPaid: number;
  currentMonthName: string | null;
  nextPaymentDate: string | null;
}

interface CycleInfo {
  open: boolean;
  startYear: number;
  label: string;
  monthNumber: number;
  monthName: string;
  catchUpMonths: string[];
  nextCycleStartYear: number | null;
}

function formatAmount(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatPoints(n: number) {
  return n.toLocaleString("en-IN") + " points";
}

// Overdue = earlier months are unpaid, or this month is still unpaid after the 10th.
function hasPendingOverdue(e: ChitPlan, now: Date) {
  if (e.reviewStatus !== "active" || e.outstanding <= 0) return false;
  const earlierUnpaid = e.outstanding > e.monthlyAmount + 0.001;
  return earlierUnpaid || now.getDate() > 10;
}

export default function ChitsScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [myChits, setMyChits] = useState<ChitPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [chitText, setChitText] = useState("2");
  const [cycle, setCycle] = useState<CycleInfo | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState("");

  const chits = parseInt(chitText, 10) || 0;
  const isValid = chits >= MIN_CHITS && chits <= MAX_CHITS;
  const figures = chitPlanFigures(isValid ? chits : 0);
  // One plan per customer per plan year (under review or approved). A rejected plan does not count.
  const currentPlan = cycle
    ? myChits.find((p) => p.cycleStartYear === cycle.startYear && p.reviewStatus !== "rejected")
    : undefined;
  const isLateJoin = !!cycle?.open && cycle.monthNumber > 1;
  const catchUpMonths = cycle?.catchUpMonths ?? [];
  const payNow = figures.monthly * (cycle?.open ? Math.max(1, cycle.monthNumber) : 1);

  const fetchMyChits = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/chits/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMyChits(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const fetchCycle = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/chits/cycle`);
      if (res.ok) setCycle(await res.json());
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => {
    void Promise.all([fetchMyChits(), fetchCycle()]).finally(() => setIsLoading(false));
  }, [fetchMyChits, fetchCycle]));

  const setChits = (n: number) => {
    setEnrollError("");
    setChitText(String(Math.min(MAX_CHITS, Math.max(MIN_CHITS, n))));
  };

  const onChangeText = (text: string) => {
    setEnrollError("");
    const digits = text.replace(/[^0-9]/g, "").slice(0, 3);
    if (digits === "") { setChitText(""); return; }
    setChitText(String(Math.min(MAX_CHITS, parseInt(digits, 10))));
  };

  const onBlurInput = () => {
    if (!isValid) setChitText(String(MIN_CHITS));
  };

  const step = (delta: number) => {
    Haptics.selectionAsync();
    setChits((isValid ? chits : 0) + delta);
  };

  // Opens the payment for everything currently pending on this plan.
  const startPayment = async (chitPlanId: number) => {
    if (!user) { router.push("/auth"); return; }
    try {
      const res = await fetch(`${getApiBase()}/payment/create-chit-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chitPlanId }),
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
          description: `Chit payment – ${data.planName}`,
          chitPlanId: String(chitPlanId),
          type: "chit",
        },
      });
    } catch {
      alert("Network error. Please try again.");
    }
  };

  const handleEnroll = async () => {
    if (!user) { router.push("/auth"); return; }
    if (!isValid) return;
    setEnrolling(true);
    setEnrollError("");
    try {
      const res = await fetch(`${getApiBase()}/chits/enroll-custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chits }),
      });
      if (!res.ok) {
        const err = await res.json();
        setEnrollError(err.error || "Could not submit your plan");
        // Already have a plan this year (e.g. a double tap): show it instead of leaving an error.
        if (err.code === "CHIT_PLAN_EXISTS") { await fetchMyChits(); setTab("mine"); }
        return;
      }
      await res.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchMyChits();
      setTab("mine"); // it now shows as "Under review" until the admin approves it
    } catch {
      setEnrollError("Something went wrong. Please try again.");
    } finally {
      setEnrolling(false);
    }
  };

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
        <Text style={styles.title}>Chit Plans</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "browse" && styles.tabActive]}
          onPress={() => { setTab("browse"); Haptics.selectionAsync(); }}
        >
          <Text style={[styles.tabText, tab === "browse" && styles.tabTextActive]}>New Plan</Text>
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

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "browse" ? (
          <>
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>Save a little every month</Text>
              <Text style={styles.introText}>
                1 chit = {formatAmount(CHIT_VALUE)} a month. Pay for {CHIT_DURATION_MONTHS} months
                (October to August) and earn {CHIT_BONUS_PERCENT}% extra as bonus points. 1 point = ₹1.
              </Text>
            </View>

            {cycle && (
              cycle.open ? (
                <View style={styles.cycleBanner}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.light.tint} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cycleBannerTitle}>Current plan year: {cycle.label}</Text>
                    <Text style={styles.cycleBannerText}>
                      It is {cycle.monthName} — month {cycle.monthNumber} of {CHIT_DURATION_MONTHS}.
                      {cycle.monthNumber === 1 ? " Best time to join!" : ""}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.closedBox}>
                  <Ionicons name="time-outline" size={22} color="#b45309" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.closedTitle}>Joining is closed for now</Text>
                    <Text style={styles.closedText}>
                      This year's plans ended in August. The next plan year starts in October {cycle.nextCycleStartYear}.
                    </Text>
                  </View>
                </View>
              )
            )}

            {currentPlan ? (
              <View style={styles.existingPlanCard}>
                <Ionicons
                  name={currentPlan.reviewStatus === "under_review" ? "hourglass-outline" : "checkmark-circle-outline"}
                  size={26}
                  color={currentPlan.reviewStatus === "under_review" ? "#b45309" : Colors.light.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.existingPlanTitle}>
                    {currentPlan.reviewStatus === "under_review"
                      ? "Your plan is under review"
                      : "You already have a chit plan this year"}
                  </Text>
                  <Text style={styles.existingPlanText}>
                    {currentPlan.name} · {currentPlan.cycleLabel}. Each customer can have one plan per plan year.
                  </Text>
                  <Pressable style={styles.existingPlanBtn} onPress={() => setTab("mine")}>
                    <Text style={styles.existingPlanBtnText}>View My Chits</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
            {/* Step 1 — choose number of chits */}
              <View style={styles.card}>
                <Text style={styles.stepLabel}>STEP 1</Text>
                <Text style={styles.cardTitle}>How many chits do you want?</Text>
  
                <View style={styles.stepperRow}>
                  <Pressable
                    accessibilityLabel="Decrease chits"
                    style={[styles.stepBtn, chits <= MIN_CHITS && styles.stepBtnDisabled]}
                    onPress={() => step(-1)}
                    disabled={chits <= MIN_CHITS}
                  >
                    <Ionicons name="remove" size={28} color={chits <= MIN_CHITS ? Colors.light.borderStrong : Colors.light.tint} />
                  </Pressable>
  
                  <View style={styles.countBox}>
                    <TextInput
                      accessibilityLabel="Number of chits"
                      style={styles.countInput}
                      value={chitText}
                      onChangeText={onChangeText}
                      onBlur={onBlurInput}
                      keyboardType="number-pad"
                      maxLength={3}
                      selectTextOnFocus
                    />
                    <Text style={styles.countUnit}>{chits === 1 ? "chit" : "chits"}</Text>
                  </View>
  
                  <Pressable
                    accessibilityLabel="Increase chits"
                    style={[styles.stepBtn, chits >= MAX_CHITS && styles.stepBtnDisabled]}
                    onPress={() => step(1)}
                    disabled={chits >= MAX_CHITS}
                  >
                    <Ionicons name="add" size={28} color={chits >= MAX_CHITS ? Colors.light.borderStrong : Colors.light.tint} />
                  </Pressable>
                </View>
  
                <View style={styles.quickRow}>
                  {QUICK_PICK_CHITS.map(n => (
                    <Pressable
                      key={n}
                      style={[styles.quickChip, chits === n && styles.quickChipActive]}
                      onPress={() => { Haptics.selectionAsync(); setChits(n); }}
                    >
                      <Text style={[styles.quickChipText, chits === n && styles.quickChipTextActive]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
  
                <Text style={styles.totalLine}>
                  {isValid
                    ? `${chits} × ${formatAmount(CHIT_VALUE)} = ${formatAmount(figures.monthly)} per month`
                    : `Choose between ${MIN_CHITS} and ${MAX_CHITS} chits`}
                </Text>
              </View>
  
              {/* Step 2 — what you pay and get */}
              <View style={styles.card}>
                <Text style={styles.stepLabel}>STEP 2</Text>
                <Text style={styles.cardTitle}>Your plan at a glance</Text>
  
                <View style={styles.monthlyBox}>
                  <Text style={styles.monthlyLabel}>You pay every month</Text>
                  <Text style={styles.monthlyAmount}>{formatAmount(figures.monthly)}</Text>
                  <Text style={styles.monthlySub}>for {CHIT_DURATION_MONTHS} months</Text>
                </View>
  
                {isLateJoin && isValid && (
                  <View style={styles.catchUpBox}>
                    <View style={styles.catchUpHeader}>
                      <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
                      <Text style={styles.catchUpTitle}>Joining late? Catch up to start</Text>
                    </View>
                    <Text style={styles.catchUpText}>
                      The plan year started in October, so you pay for the {catchUpMonths.length} months
                      already passed ({catchUpMonths[0]} to {catchUpMonths[catchUpMonths.length - 1]}) once your plan is approved.
                    </Text>
                    <View style={styles.catchUpMath}>
                      <Text style={styles.catchUpMathText}>
                        {catchUpMonths.length} months × {formatAmount(figures.monthly)}
                      </Text>
                      <Text style={styles.catchUpAmount}>{formatAmount(payNow)}</Text>
                    </View>
                    <Text style={styles.catchUpFoot}>
                      You pay this after approval. After that, {formatAmount(figures.monthly)} every month until August.
                      You still pay the same {formatAmount(figures.total)} in total and earn the full bonus.
                    </Text>
                  </View>
                )}
  
                <View style={styles.summaryRow}>
                  <View style={styles.summaryTextWrap}>
                    <Text style={styles.summaryLabel}>Total you pay in {CHIT_DURATION_MONTHS} months</Text>
                    <Text style={styles.summaryHint}>{formatAmount(figures.monthly)} × {CHIT_DURATION_MONTHS}</Text>
                  </View>
                  <Text style={styles.summaryValue}>{formatAmount(figures.total)}</Text>
                </View>
  
                <View style={styles.summaryRow}>
                  <View style={styles.summaryTextWrap}>
                    <Text style={styles.summaryLabel}>Bonus points you earn</Text>
                    <Text style={styles.summaryHint}>{CHIT_BONUS_PERCENT}% of {formatAmount(figures.total)}</Text>
                  </View>
                  <Text style={[styles.summaryValue, styles.bonusValue]}>+ {figures.bonusPoints.toLocaleString("en-IN")}</Text>
                </View>
  
                <View style={styles.divider} />
  
                <View style={styles.finalBox}>
                  <Text style={styles.finalLabel}>Total value you receive</Text>
                  <Text style={styles.finalAmount}>{formatAmount(figures.finalValue)}</Text>
                  <Text style={styles.finalSub}>
                    {formatAmount(figures.total)} paid + {formatPoints(figures.bonusPoints)}
                  </Text>
                </View>
              </View>
  
              {enrollError ? <Text style={styles.errorNote}>{enrollError}</Text> : null}
  
              <Pressable
                style={[styles.startBtn, (!isValid || enrolling || !cycle?.open) && { opacity: 0.5 }]}
                onPress={handleEnroll}
                disabled={!isValid || enrolling || !cycle?.open}
              >
                {enrolling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.startBtnText}>
                    {!isValid
                      ? "Submit Plan for Approval"
                      : "Submit Plan for Approval"}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.finePrint}>
                Your plan is reviewed first and you can pay once it is approved. Pay each month's amount by the 10th.
                Your chit money stays locked in your wallet until the plan completes in August, then it is released with your {CHIT_BONUS_PERCENT}% bonus points.
              </Text>
              </>
            )}
          </>
        ) : (
          !user ? (
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={64} color={Colors.light.borderStrong} />
              <Text style={styles.emptyText}>Sign in to see your chits</Text>
              <Pressable style={styles.actionBtn} onPress={() => router.push("/auth")}>
                <Text style={styles.actionBtnText}>Sign In</Text>
              </Pressable>
            </View>
          ) : myChits.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={64} color={Colors.light.borderStrong} />
              <Text style={styles.emptyText}>No active chits</Text>
              <Text style={styles.emptySubtext}>Start saving with a chit plan</Text>
              <Pressable style={styles.actionBtn} onPress={() => setTab("browse")}>
                <Text style={styles.actionBtnText}>Create a Plan</Text>
              </Pressable>
            </View>
          ) : (
            myChits.map(e => {
              if (e.reviewStatus === "under_review") {
                return (
                  <View key={e.id} style={[styles.myChitCard, styles.myChitCardReview]}>
                    <View style={styles.myChitHeader}>
                      <Text style={styles.myChitName}>{e.name}</Text>
                      <View style={[styles.statusPill, { backgroundColor: "#FFFBEB" }]}>
                        <Text style={[styles.statusText, { color: "#b45309" }]}>Under review</Text>
                      </View>
                    </View>
                    <View style={styles.pendingRow}>
                      <Ionicons name="hourglass-outline" size={16} color="#b45309" />
                      <Text style={styles.pendingText}>
                        Your plan has been sent for approval. We will message you on WhatsApp as soon as it is
                        approved. You can start paying after that.
                      </Text>
                    </View>
                    <View style={styles.myChitStats}>
                      <View style={styles.myStatItem}>
                        <Text style={styles.myStatLabel}>Per month</Text>
                        <Text style={styles.myStatValue}>{formatAmount(e.monthlyAmount)}</Text>
                      </View>
                      <View style={styles.myStatItem}>
                        <Text style={styles.myStatLabel}>Total</Text>
                        <Text style={styles.myStatValue}>{formatAmount(e.totalAmount)}</Text>
                      </View>
                      <View style={styles.myStatItem}>
                        <Text style={styles.myStatLabel}>Bonus</Text>
                        <Text style={styles.myStatValue}>+{e.bonusPoints.toLocaleString("en-IN")}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardFoot}>Plan year {e.cycleLabel}</Text>
                  </View>
                );
              }

              if (e.reviewStatus === "rejected") {
                return (
                  <View key={e.id} style={[styles.myChitCard, styles.myChitCardOverdue]}>
                    <View style={styles.myChitHeader}>
                      <Text style={styles.myChitName}>{e.name}</Text>
                      <View style={[styles.statusPill, { backgroundColor: Colors.light.dangerLight }]}>
                        <Text style={[styles.statusText, { color: Colors.light.error }]}>Not approved</Text>
                      </View>
                    </View>
                    <View style={styles.overdueRow}>
                      <Ionicons name="close-circle" size={16} color={Colors.light.error} />
                      <Text style={styles.overdueText}>
                        {e.rejectionReason ? `Reason: ${e.rejectionReason}` : "This plan could not be approved."}
                      </Text>
                    </View>
                    <Pressable style={styles.actionBtn} onPress={() => setTab("browse")}>
                      <Text style={styles.actionBtnText}>Create a New Plan</Text>
                    </Pressable>
                  </View>
                );
              }

              const now = new Date();
              const nextDate = e.nextPaymentDate ? new Date(e.nextPaymentDate) : null;
              const isCompleted = e.reviewStatus === "completed";
              const hasPending = !isCompleted && e.outstanding > 0;
              const earlierMonths = hasPending
                ? Math.max(0, Math.ceil(e.outstanding / e.monthlyAmount - 1e-9) - 1)
                : 0;
              const isOverdue = hasPendingOverdue(e, now);
              const progress = e.totalAmount > 0 ? Math.min(100, Math.round((e.amountPaid / e.totalAmount) * 100)) : 0;
              const pillBg = isCompleted ? "#E8F0FF" : isOverdue ? Colors.light.dangerLight : Colors.light.tintLight;
              const pillColor = isCompleted ? "#2563eb" : isOverdue ? Colors.light.error : Colors.light.success;
              const pillLabel = isCompleted ? "Completed" : isOverdue ? "Overdue" : "Active";
              const progressColor = isCompleted ? "#2563eb" : isOverdue ? Colors.light.error : Colors.light.success;

              return (
              <View key={e.id} style={[styles.myChitCard, isOverdue && styles.myChitCardOverdue, isCompleted && styles.myChitCardCompleted]}>
                <View style={styles.myChitHeader}>
                  <Text style={styles.myChitName}>{e.name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
                    <Text style={[styles.statusText, { color: pillColor }]}>{pillLabel}</Text>
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` as any, backgroundColor: progressColor }]} />
                  </View>
                  <Text style={styles.progressText}>{e.monthsPaid}/{e.durationMonths} mo · {progress}%</Text>
                </View>

                <View style={styles.myChitStats}>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Total</Text>
                    <Text style={styles.myStatValue}>{formatAmount(e.totalAmount)}</Text>
                  </View>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Per month</Text>
                    <Text style={styles.myStatValue}>{formatAmount(e.monthlyAmount)}</Text>
                  </View>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Paid</Text>
                    <Text style={styles.myStatValue}>{formatAmount(Math.round(e.amountPaid))}</Text>
                  </View>
                </View>

                <View style={styles.bonusRow}>
                  <Ionicons name="gift-outline" size={15} color={Colors.light.tint} />
                  <Text style={styles.bonusRowText}>
                    {isCompleted
                      ? `${formatPoints(e.bonusPoints)} bonus added to your wallet`
                      : `${formatPoints(e.bonusPoints)} bonus when you finish all ${e.durationMonths} payments`}
                  </Text>
                </View>

                {hasPending && (
                  <View style={isOverdue ? styles.overdueRow : styles.pendingRow}>
                    <Ionicons
                      name={isOverdue ? "alert-circle" : "time-outline"}
                      size={16}
                      color={isOverdue ? Colors.light.error : "#b45309"}
                    />
                    <Text style={isOverdue ? styles.overdueText : styles.pendingText}>
                      {formatAmount(e.outstanding)} pending
                      {e.currentMonthName ? ` for ${e.currentMonthName}` : ""}
                      {earlierMonths > 0 ? ` (includes ${earlierMonths} earlier month${earlierMonths === 1 ? "" : "s"})` : ""}
                      {e.amountPaid > 0 && e.outstanding < e.monthlyAmount ? " — part payment received, please pay the rest" : ""}
                    </Text>
                  </View>
                )}

                {!hasPending && !isCompleted && (
                  <View style={styles.paidUpRow}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.light.success} />
                    <Text style={styles.paidUpText}>
                      You are paid up{e.currentMonthName ? ` for ${e.currentMonthName}` : ""}
                    </Text>
                  </View>
                )}

                {!hasPending && !isCompleted && nextDate && (
                  <View style={styles.nextPaymentRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.light.textMuted} />
                    <Text style={styles.nextPaymentText}>
                      Next payment opens {nextDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                )}

                {isCompleted && (
                  <View style={styles.completedRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#2563eb" />
                    <Text style={styles.completedText}>All installments paid — plan complete!</Text>
                  </View>
                )}

                {hasPending && (
                  <Pressable style={[styles.payEmiBtn, isOverdue && styles.payEmiBtnOverdue]} onPress={() => startPayment(e.id)}>
                    <Ionicons name={isOverdue ? "alert-circle" : "lock-closed"} size={16} color="#fff" />
                    <Text style={styles.payEmiBtnText}>Pay Pending – {formatAmount(e.outstanding)}</Text>
                  </Pressable>
                )}
              </View>
              );
            })
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  header: { paddingHorizontal: 20, paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.light.text },
  tabs: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 16,
    backgroundColor: Colors.light.border, borderRadius: 12, padding: 3,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 9, flexDirection: "row", justifyContent: "center", gap: 6 },
  tabActive: { backgroundColor: Colors.light.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, color: Colors.light.textMuted },
  tabTextActive: { color: Colors.light.text, fontWeight: "500" },
  badge: { backgroundColor: Colors.light.tint, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center" },
  badgeText: { color: "#fff", fontSize: 9 },
  content: { paddingHorizontal: 16, gap: 14 },

  introCard: {
    backgroundColor: Colors.light.tintLight, borderRadius: 14, padding: 14, gap: 4,
    borderLeftWidth: 3, borderLeftColor: Colors.light.tint,
  },
  introTitle: { fontSize: 15, fontWeight: "700", color: Colors.light.tint },
  introText: { fontSize: 13, color: "#3B6D11", lineHeight: 19 },

  card: {
    backgroundColor: Colors.light.surface, borderRadius: 18, padding: 18, gap: 12,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  stepLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: Colors.light.textMuted },
  cardTitle: { fontSize: 17, fontWeight: "700", color: Colors.light.text, marginTop: -6 },

  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  stepBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.light.tintLight, borderWidth: 1.5, borderColor: Colors.light.tint,
  },
  stepBtnDisabled: { backgroundColor: Colors.light.background, borderColor: Colors.light.border },
  countBox: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 14,
    backgroundColor: Colors.light.background,
  },
  countInput: {
    fontSize: 36, fontWeight: "700", color: Colors.light.text, textAlign: "center",
    minWidth: 90, padding: 0,
  },
  countUnit: { fontSize: 12, color: Colors.light.textMuted, marginTop: -2 },

  quickRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  quickChip: {
    minWidth: 52, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: "center",
    borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface,
  },
  quickChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  quickChipText: { fontSize: 14, fontWeight: "600", color: Colors.light.textSecondary },
  quickChipTextActive: { color: "#fff" },
  totalLine: { fontSize: 14, color: Colors.light.textSecondary, textAlign: "center", fontWeight: "500" },

  monthlyBox: {
    backgroundColor: Colors.light.tintLight, borderRadius: 14, padding: 16, alignItems: "center", gap: 2,
  },
  monthlyLabel: { fontSize: 13, fontWeight: "600", color: Colors.light.tint },
  monthlyAmount: { fontSize: 34, fontWeight: "800", color: Colors.light.tint },
  monthlySub: { fontSize: 13, color: "#3B6D11" },

  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  summaryTextWrap: { flex: 1 },
  summaryLabel: { fontSize: 14, fontWeight: "600", color: Colors.light.text },
  summaryHint: { fontSize: 12, color: Colors.light.textMuted, marginTop: 1 },
  summaryValue: { fontSize: 18, fontWeight: "700", color: Colors.light.text },
  bonusValue: { color: Colors.light.success },
  divider: { height: 1, backgroundColor: Colors.light.border },

  finalBox: {
    backgroundColor: "#1A1A1A", borderRadius: 14, padding: 16, alignItems: "center", gap: 2,
  },
  finalLabel: { fontSize: 13, color: "#D8D4CE", fontWeight: "500" },
  finalAmount: { fontSize: 32, fontWeight: "800", color: "#fff" },
  finalSub: { fontSize: 12, color: "#D8D4CE" },

  errorNote: { fontSize: 13, color: Colors.light.error, textAlign: "center" },
  startBtn: {
    backgroundColor: Colors.light.tint, borderRadius: 14, paddingVertical: 16,
    alignItems: "center", justifyContent: "center",
  },
  startBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  finePrint: { fontSize: 12, color: Colors.light.textMuted, textAlign: "center", lineHeight: 17 },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 18, fontWeight: "600", color: Colors.light.text },
  emptySubtext: { fontSize: 13, color: Colors.light.textMuted, textAlign: "center" },
  actionBtn: { backgroundColor: "#1A1A1A", borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12, marginTop: 4 },
  actionBtnText: { fontSize: 13, fontWeight: "500", color: Colors.light.cream },

  myChitCard: {
    backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  myChitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  myChitName: { fontSize: 15, fontWeight: "500", color: Colors.light.text, flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: "500" },
  myChitStats: { flexDirection: "row", justifyContent: "space-between" },
  myStatItem: { alignItems: "center" },
  myStatLabel: { fontSize: 11, color: Colors.light.textMuted },
  myStatValue: { fontSize: 14, fontWeight: "600", color: Colors.light.text },
  bonusRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.light.tintLight, borderRadius: 8, padding: 8,
  },
  bonusRowText: { fontSize: 12, color: Colors.light.tint, flex: 1, fontWeight: "500" },
  nextPaymentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nextPaymentText: { fontSize: 12, color: Colors.light.textMuted },
  payEmiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.light.tint, borderRadius: 12, paddingVertical: 12,
  },
  payEmiBtnText: { fontSize: 15, fontWeight: "500", color: "#fff" },
  payEmiBtnOverdue: { backgroundColor: Colors.light.error },
  myChitCardOverdue: { borderWidth: 1.5, borderColor: Colors.light.error + "60" },
  myChitCardCompleted: { borderWidth: 1.5, borderColor: "#2563eb40" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressBarBg: { flex: 1, height: 5, borderRadius: 999, backgroundColor: Colors.light.border, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 999 },
  progressText: { fontSize: 11, color: Colors.light.textMuted, minWidth: 90, textAlign: "right" },
  overdueRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: Colors.light.dangerLight, borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: "#FCCFC9",
  },
  overdueText: { fontSize: 12, color: Colors.light.error, flex: 1, lineHeight: 17 },
  myChitCardReview: { borderWidth: 1.5, borderColor: "#FCD34D" },
  cardFoot: { fontSize: 11, color: Colors.light.textMuted },
  existingPlanCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  existingPlanTitle: { fontSize: 15, fontWeight: "700", color: Colors.light.text },
  existingPlanText: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 3, lineHeight: 19 },
  existingPlanBtn: {
    alignSelf: "flex-start", marginTop: 10, backgroundColor: "#1A1A1A",
    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9,
  },
  existingPlanBtnText: { fontSize: 13, fontWeight: "500", color: Colors.light.cream },
  pendingRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#FFFBEB", borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  pendingText: { fontSize: 12, color: "#b45309", flex: 1, lineHeight: 17 },
  paidUpRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  paidUpText: { fontSize: 12, color: Colors.light.success, fontWeight: "500" },
  cycleBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.light.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  cycleBannerTitle: { fontSize: 14, fontWeight: "700", color: Colors.light.text },
  cycleBannerText: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  closedBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#FFFBEB", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  closedTitle: { fontSize: 15, fontWeight: "700", color: "#92400e" },
  closedText: { fontSize: 13, color: "#b45309", marginTop: 2, lineHeight: 19 },
  catchUpBox: {
    backgroundColor: "#FFFBEB", borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1.5, borderColor: "#FCD34D",
  },
  catchUpHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  catchUpTitle: { fontSize: 15, fontWeight: "700", color: "#92400e" },
  catchUpText: { fontSize: 13, color: "#92400e", lineHeight: 19 },
  catchUpMath: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 10, padding: 12,
  },
  catchUpMathText: { fontSize: 14, color: Colors.light.textSecondary, fontWeight: "500" },
  catchUpAmount: { fontSize: 22, fontWeight: "800", color: "#92400e" },
  catchUpFoot: { fontSize: 12, color: "#b45309", lineHeight: 17 },
  completedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  completedText: { fontSize: 12, color: "#2563eb" },
});
