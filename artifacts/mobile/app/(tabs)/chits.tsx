import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";

interface ChitPlan {
  id: number;
  name: string;
  description?: string;
  totalAmount: number;
  monthlyContribution: number;
  duration: number;
  members: number;
  maxMembers: number;
  startDate?: string;
  status: string;
}

interface ChitEnrollment {
  id: number;
  chitPlan: ChitPlan;
  joinedAt: string;
  amountPaid: number;
  nextPaymentDate?: string;
  status: string;
}

export default function ChitsScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [plans, setPlans] = useState<ChitPlan[]>([]);
  const [myChits, setMyChits] = useState<ChitEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [joining, setJoining] = useState<number | null>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/chits`);
      if (res.ok) setPlans(await res.json());
    } catch { /* ignore */ }
  }, []);

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
    Promise.all([fetchPlans(), fetchMyChits()]).finally(() => setIsLoading(false));
  }, [fetchPlans, fetchMyChits]);

  const joinChit = async (chitPlanId: number) => {
    if (!user) { router.push("/auth"); return; }
    setJoining(chitPlanId);
    try {
      const res = await fetch(`${getApiBase()}/chits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chitPlanId }),
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await fetchMyChits();
        await fetchPlans();
        setTab("mine");
      }
    } catch { /* ignore */ } finally {
      setJoining(null);
    }
  };

  const isEnrolled = (planId: number) => myChits.some(e => e.chitPlan.id === planId);

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
        <View>
          <Text style={styles.title}>Chit Savings</Text>
          <Text style={styles.subtitle}>Save together, prosper together</Text>
        </View>
        <View style={styles.savingsIcon}>
          <MaterialCommunityIcons name="piggy-bank" size={28} color={Colors.light.tint} />
        </View>
      </View>

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
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{myChits.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 90 }]}>
        {tab === "browse" ? (
          plans.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="piggy-bank-outline" size={64} color={Colors.light.border} />
              <Text style={styles.emptyText}>No chit plans available</Text>
              <Text style={styles.emptySubtext}>Check back soon for new savings opportunities</Text>
            </View>
          ) : (
            plans.map(plan => (
              <View key={plan.id} style={styles.planCard}>
                <View style={[styles.planHeader, { backgroundColor: plan.status === "active" ? Colors.light.tintDark : Colors.light.tint }]}>
                  <View>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <View style={styles.statusRow}>
                      <View style={styles.statusDot} />
                      <Text style={styles.planStatus}>{plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}</Text>
                    </View>
                  </View>
                  <View style={styles.planAmountBadge}>
                    <Text style={styles.planAmountLabel}>Pool</Text>
                    <Text style={styles.planAmountValue}>₹{(plan.totalAmount / 1000).toFixed(0)}K</Text>
                  </View>
                </View>
                <View style={styles.planBody}>
                  {plan.description && <Text style={styles.planDesc}>{plan.description}</Text>}
                  <View style={styles.planStats}>
                    <View style={styles.stat}>
                      <Ionicons name="calendar-outline" size={16} color={Colors.light.tint} />
                      <Text style={styles.statLabel}>Duration</Text>
                      <Text style={styles.statValue}>{plan.duration} months</Text>
                    </View>
                    <View style={styles.stat}>
                      <Ionicons name="people-outline" size={16} color={Colors.light.tint} />
                      <Text style={styles.statLabel}>Members</Text>
                      <Text style={styles.statValue}>{plan.members}/{plan.maxMembers}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Ionicons name="wallet-outline" size={16} color={Colors.light.tint} />
                      <Text style={styles.statLabel}>Monthly</Text>
                      <Text style={styles.statValue}>₹{plan.monthlyContribution.toFixed(0)}</Text>
                    </View>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBar, { width: `${(plan.members / plan.maxMembers) * 100}%` as any }]} />
                  </View>
                  <Text style={styles.progressText}>{plan.maxMembers - plan.members} spots remaining</Text>

                  {isEnrolled(plan.id) ? (
                    <View style={styles.enrolledBadge}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.light.success} />
                      <Text style={styles.enrolledText}>Enrolled</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.joinBtn, (plan.status !== "open" || plan.members >= plan.maxMembers) && styles.joinBtnDisabled]}
                      onPress={() => joinChit(plan.id)}
                      disabled={plan.status !== "open" || plan.members >= plan.maxMembers || joining === plan.id}
                    >
                      {joining === plan.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.joinBtnText}>
                          {plan.status !== "open" ? "Not Open" : plan.members >= plan.maxMembers ? "Full" : "Join Plan"}
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            ))
          )
        ) : (
          !user ? (
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={64} color={Colors.light.border} />
              <Text style={styles.emptyText}>Sign in to see your chits</Text>
              <Pressable style={styles.signInBtn} onPress={() => router.push("/auth")}>
                <Text style={styles.signInBtnText}>Sign In</Text>
              </Pressable>
            </View>
          ) : myChits.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="piggy-bank-outline" size={64} color={Colors.light.border} />
              <Text style={styles.emptyText}>No active chits</Text>
              <Pressable style={styles.signInBtn} onPress={() => setTab("browse")}>
                <Text style={styles.signInBtnText}>Browse Plans</Text>
              </Pressable>
            </View>
          ) : (
            myChits.map(enrollment => (
              <View key={enrollment.id} style={styles.myChitCard}>
                <View style={styles.myChitHeader}>
                  <Text style={styles.myChitName}>{enrollment.chitPlan.name}</Text>
                  <View style={[styles.myChitStatus, { backgroundColor: enrollment.status === "active" ? "#E8F8EE" : "#FFF0EE" }]}>
                    <Text style={[styles.myChitStatusText, { color: enrollment.status === "active" ? Colors.light.success : Colors.light.tint }]}>
                      {enrollment.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.myChitStats}>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Paid so far</Text>
                    <Text style={styles.myStatValue}>₹{enrollment.amountPaid.toFixed(0)}</Text>
                  </View>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Monthly</Text>
                    <Text style={styles.myStatValue}>₹{enrollment.chitPlan.monthlyContribution.toFixed(0)}</Text>
                  </View>
                  <View style={styles.myStatItem}>
                    <Text style={styles.myStatLabel}>Pool</Text>
                    <Text style={styles.myStatValue}>₹{(enrollment.chitPlan.totalAmount / 1000).toFixed(0)}K</Text>
                  </View>
                </View>
                {enrollment.nextPaymentDate && (
                  <View style={styles.nextPayment}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.light.textMuted} />
                    <Text style={styles.nextPaymentText}>
                      Next: {new Date(enrollment.nextPaymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 26, color: Colors.light.text },
  subtitle: { fontSize: 13, color: Colors.light.textMuted },
  savingsIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.light.cream, alignItems: "center", justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10, flexDirection: "row", justifyContent: "center", gap: 6 },
  tabActive: { backgroundColor: "#fff", shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, color: Colors.light.textMuted },
  tabTextActive: { color: Colors.light.text, },
  badge: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1,
    minWidth: 20, alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, },
  content: { paddingHorizontal: 16, gap: 16 },
  planCard: {
    backgroundColor: "#fff", borderRadius: 20, overflow: "hidden",
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  planHeader: { padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontSize: 18, color: "#fff" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#A8F0B8" },
  planStatus: { fontSize: 12, color: "rgba(255,255,255,0.85)" },
  planAmountBadge: {
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12,
    padding: 10, alignItems: "center",
  },
  planAmountLabel: { fontSize: 11, color: "rgba(255,255,255,0.85)" },
  planAmountValue: { fontSize: 20, color: "#fff" },
  planBody: { padding: 16, gap: 12 },
  planDesc: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 20 },
  planStats: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", gap: 4 },
  statLabel: { fontSize: 11, color: Colors.light.textMuted },
  statValue: { fontSize: 14, color: Colors.light.text },
  progressBarBg: { height: 6, backgroundColor: Colors.light.surface, borderRadius: 3, overflow: "hidden" },
  progressBar: { height: "100%", backgroundColor: Colors.light.tint, borderRadius: 3 },
  progressText: { fontSize: 11, color: Colors.light.textMuted },
  enrolledBadge: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", paddingVertical: 12 },
  enrolledText: { fontSize: 15, color: Colors.light.success },
  joinBtn: {
    backgroundColor: Colors.light.tint, borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
  },
  joinBtnDisabled: { backgroundColor: Colors.light.border },
  joinBtnText: { fontSize: 15, color: "#fff" },
  myChitCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 12,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  myChitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  myChitName: { fontSize: 16, color: Colors.light.text, flex: 1 },
  myChitStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  myChitStatusText: { fontSize: 12, },
  myChitStats: { flexDirection: "row", justifyContent: "space-between" },
  myStatItem: { alignItems: "center" },
  myStatLabel: { fontSize: 11, color: Colors.light.textMuted },
  myStatValue: { fontSize: 15, color: Colors.light.text },
  nextPayment: { flexDirection: "row", alignItems: "center", gap: 6 },
  nextPaymentText: { fontSize: 12, color: Colors.light.textMuted },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 18, color: Colors.light.text },
  emptySubtext: { fontSize: 13, color: Colors.light.textMuted, textAlign: "center" },
  signInBtn: { backgroundColor: Colors.light.tint, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  signInBtnText: { fontSize: 15, color: "#fff" },
});
