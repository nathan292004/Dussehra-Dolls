import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/auth";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleSubmit = async () => {
    setError("");
    if (!email || !password) { setError("Please fill all fields"); return; }
    if (mode === "register" && !name) { setError("Name is required"); return; }
    setIsLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, phone, password);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 20, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>

        <View style={styles.brandContainer}>
          <View style={styles.brandIcon}>
            <Ionicons name="storefront" size={36} color="#fff" />
          </View>
          <Text style={styles.brandName}>Dussehra Dolls</Text>
          <Text style={styles.brandTagline}>Festive crafts for every home</Text>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.modeTab, mode === "login" && styles.modeTabActive]}
            onPress={() => { setMode("login"); setError(""); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.modeTabText, mode === "login" && styles.modeTabTextActive]}>Sign In</Text>
          </Pressable>
          <Pressable
            style={[styles.modeTab, mode === "register" && styles.modeTabActive]}
            onPress={() => { setMode("register"); setError(""); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.modeTabText, mode === "register" && styles.modeTabTextActive]}>Register</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color={Colors.light.textMuted} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.light.textMuted}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={18} color={Colors.light.textMuted} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone (Optional)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color={Colors.light.textMuted} />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={Colors.light.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.light.textMuted} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.light.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.light.textMuted} />
              </Pressable>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.light.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>{mode === "login" ? "Sign In" : "Create Account"}</Text>
            )}
          </Pressable>

          <Text style={styles.switchText}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <Text
              style={styles.switchLink}
              onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            >
              {mode === "login" ? "Register" : "Sign In"}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { paddingHorizontal: 24 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    alignSelf: "flex-start", marginBottom: 24,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  brandContainer: { alignItems: "center", marginBottom: 32, gap: 8 },
  brandIcon: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: Colors.light.tint, alignItems: "center", justifyContent: "center",
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  brandName: { fontSize: 26, fontFamily: "Inter_700Bold", color: Colors.light.text },
  brandTagline: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.textMuted },
  tabRow: {
    flexDirection: "row", backgroundColor: Colors.light.surface, borderRadius: 14,
    padding: 4, marginBottom: 28,
  },
  modeTab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  modeTabActive: {
    backgroundColor: "#fff",
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  modeTabText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.light.textMuted },
  modeTabTextActive: { color: Colors.light.text, fontFamily: "Inter_700Bold" },
  form: { gap: 18 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  inputContainer: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.light.border,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  input: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFF0EE", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#FCCFC9",
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.light.error, flex: 1 },
  submitBtn: {
    backgroundColor: Colors.light.tint, borderRadius: 14,
    paddingVertical: 17, alignItems: "center",
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  switchText: {
    textAlign: "center", fontSize: 14, fontFamily: "Inter_400Regular",
    color: Colors.light.textMuted,
  },
  switchLink: { color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
});
