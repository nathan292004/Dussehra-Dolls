import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

export default function PaymentResultScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ success: string; message?: string; type: string; isCompleted?: string }>();
  const isSuccess = params.success === "true";
  const isChit = params.type === "chit";
  const isWallet = params.type === "wallet";
  const isCompleted = params.isCompleted === "true";
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (isSuccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: isSuccess ? "#E8F8EE" : "#FFF0EE" }]}>
          <Ionicons
            name={isSuccess ? "checkmark-circle" : "close-circle"}
            size={72}
            color={isSuccess ? Colors.light.success : Colors.light.error}
          />
        </View>

        <Text style={styles.title}>
          {isSuccess
            ? isWallet
              ? "Money Added!"
              : isChit
              ? isCompleted ? "Chit Plan Complete!" : "EMI Paid!"
              : "Order Placed!"
            : "Payment Failed"}
        </Text>

        <Text style={styles.subtitle}>
          {isSuccess
            ? isWallet
              ? "Your wallet has been topped up successfully."
              : isChit
              ? isCompleted
                ? "Congratulations! You've completed your chit plan."
                : "Your EMI has been recorded. Keep it up!"
              : "Your order has been confirmed and will be delivered soon."
            : params.message || "Something went wrong. Please try again."}
        </Text>

        <View style={styles.btnGroup}>
          {isSuccess && isWallet && (
            <Pressable style={styles.primaryBtn} onPress={() => router.push("/(tabs)/wallet")}>
              <Text style={styles.primaryBtnText}>View Wallet</Text>
            </Pressable>
          )}
          {isSuccess && !isChit && !isWallet && (
            <Pressable style={styles.primaryBtn} onPress={() => router.push("/(tabs)")}>
              <Text style={styles.primaryBtnText}>Continue Shopping</Text>
            </Pressable>
          )}
          {isSuccess && isChit && (
            <Pressable style={styles.primaryBtn} onPress={() => router.push("/(tabs)/chits")}>
              <Text style={styles.primaryBtnText}>My Chit Plans</Text>
            </Pressable>
          )}
          {!isSuccess && (
            <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondaryBtn} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.secondaryBtnText}>Go to Home</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 32,
  },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: "center", justifyContent: "center", marginBottom: 28,
  },
  title: { fontSize: 26, color: Colors.light.text, textAlign: "center", marginBottom: 12 },
  subtitle: { fontSize: 15, color: Colors.light.textMuted, textAlign: "center", lineHeight: 22, marginBottom: 40 },
  btnGroup: { width: "100%", gap: 12 },
  primaryBtn: {
    backgroundColor: Colors.light.tint, borderRadius: 14, paddingVertical: 16,
    alignItems: "center",
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { fontSize: 16, color: "#fff" },
  secondaryBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
    borderWidth: 1.5, borderColor: Colors.light.border, backgroundColor: "#fff",
  },
  secondaryBtnText: { fontSize: 16, color: Colors.light.textSecondary },
});
