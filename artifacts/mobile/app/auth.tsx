import React, { useState, useRef } from "react";
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

type Mode = "login" | "register";
type RegisterStep = "details" | "otp";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, register, sendOtp } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [registerStep, setRegisterStep] = useState<RegisterStep>("details");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    setError("");
    if (!phone) { setError("Please enter your phone number"); return; }
    if (!name) { setError("Please enter your name"); return; }
    if (!password || password.length < 6) { setError("Password must be at least 6 characters"); return; }

    setIsLoading(true);
    try {
      await sendOtp(phone);
      setOtpSent(true);
      setRegisterStep("otp");
      startCountdown();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.message || "Failed to send OTP");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setError("");
    setIsLoading(true);
    try {
      await sendOtp(phone);
      setOtp(["", "", "", "", "", ""]);
      startCountdown();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.message || "Failed to resend OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 1) {
      const newOtp = [...otp];
      digits.split("").forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtp(newOtp);
      const nextIdx = Math.min(index + digits.length, 5);
      otpRefs.current[nextIdx]?.focus();
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = digits;
    setOtp(newOtp);
    if (digits && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyAndRegister = async () => {
    setError("");
    const otpCode = otp.join("");
    if (otpCode.length !== 6) { setError("Please enter the 6-digit OTP"); return; }

    setIsLoading(true);
    try {
      await register(name, phone, password, otpCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      setError(err.message || "Verification failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setError("");
    if (!phone || !password) { setError("Please enter phone and password"); return; }
    setIsLoading(true);
    try {
      await login(phone, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      setError(err.message || "Login failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setRegisterStep("details");
    setError("");
    setOtp(["", "", "", "", "", ""]);
    setOtpSent(false);
    setCountdown(0);
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
            onPress={() => { switchMode("login"); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.modeTabText, mode === "login" && styles.modeTabTextActive]}>Sign In</Text>
          </Pressable>
          <Pressable
            style={[styles.modeTab, mode === "register" && styles.modeTabActive]}
            onPress={() => { switchMode("register"); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.modeTabText, mode === "register" && styles.modeTabTextActive]}>Register</Text>
          </Pressable>
        </View>

        {mode === "login" ? (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color={Colors.light.textMuted} />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={Colors.light.textMuted}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
              </View>
            </View>

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

            {error ? <ErrorBox message={error} /> : null}

            <Pressable style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]} onPress={handleLogin} disabled={isLoading}>
              {isLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Sign In</Text>}
            </Pressable>

            <Text style={styles.switchText}>
              Don't have an account?{" "}
              <Text style={styles.switchLink} onPress={() => switchMode("register")}>Register</Text>
            </Text>
          </View>
        ) : registerStep === "details" ? (
          <View style={styles.form}>
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.light.textMuted} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={Colors.light.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.light.textMuted} />
                </Pressable>
              </View>
            </View>

            {error ? <ErrorBox message={error} /> : null}

            <Pressable style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]} onPress={handleSendOtp} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>Send OTP</Text>
                </View>
              )}
            </Pressable>

            <Text style={styles.switchText}>
              Already have an account?{" "}
              <Text style={styles.switchLink} onPress={() => switchMode("login")}>Sign In</Text>
            </Text>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.otpHeader}>
              <View style={styles.otpIconCircle}>
                <Ionicons name="shield-checkmark-outline" size={32} color={Colors.light.tint} />
              </View>
              <Text style={styles.otpTitle}>Verify Your Number</Text>
              <Text style={styles.otpSubtitle}>
                We sent a 6-digit code to{"\n"}
                <Text style={{ color: Colors.light.tint }}>{phone}</Text>
              </Text>
            </View>

            <View style={styles.otpRow}>
              {otp.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(r) => { otpRefs.current[idx] = r; }}
                  style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                  value={digit}
                  onChangeText={(v) => handleOtpChange(v, idx)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, idx)}
                  keyboardType="number-pad"
                  maxLength={6}
                  selectTextOnFocus
                  textAlign="center"
                />
              ))}
            </View>

            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={styles.resendCountdown}>Resend OTP in {countdown}s</Text>
              ) : (
                <Pressable onPress={handleResendOtp} disabled={isLoading}>
                  <Text style={styles.resendLink}>Resend OTP</Text>
                </Pressable>
              )}
            </View>

            {error ? <ErrorBox message={error} /> : null}

            <Pressable style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]} onPress={handleVerifyAndRegister} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>Verify & Create Account</Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={() => { setRegisterStep("details"); setError(""); setOtp(["","","","","",""]); }}>
              <Text style={[styles.switchText, { textAlign: "center" }]}>
                <Ionicons name="arrow-back-outline" size={13} color={Colors.light.textMuted} />
                {" "}Change phone number
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle-outline" size={16} color={Colors.light.error} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
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
  brandName: { fontSize: 26, color: Colors.light.text },
  brandTagline: { fontSize: 13, color: Colors.light.textMuted },
  tabRow: {
    flexDirection: "row", backgroundColor: Colors.light.surface, borderRadius: 14,
    padding: 4, marginBottom: 28,
  },
  modeTab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  modeTabActive: {
    backgroundColor: "#fff",
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  modeTabText: { fontSize: 15, color: Colors.light.textMuted },
  modeTabTextActive: { color: Colors.light.text },
  form: { gap: 18 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, color: Colors.light.textSecondary },
  inputContainer: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.light.border,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  input: { flex: 1, fontSize: 15, color: Colors.light.text },
  otpHeader: { alignItems: "center", gap: 10, marginBottom: 8 },
  otpIconCircle: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.light.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: Colors.light.tint + "30",
  },
  otpTitle: { fontSize: 22, color: Colors.light.text },
  otpSubtitle: { fontSize: 14, color: Colors.light.textMuted, textAlign: "center", lineHeight: 22 },
  otpRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  otpBox: {
    width: 46, height: 56, borderRadius: 14,
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: Colors.light.border,
    fontSize: 24, color: Colors.light.text,
    shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  otpBoxFilled: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tint + "08",
  },
  resendRow: { alignItems: "center" },
  resendCountdown: { fontSize: 13, color: Colors.light.textMuted },
  resendLink: { fontSize: 13, color: Colors.light.tint },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFF0EE", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#FCCFC9",
  },
  errorText: { fontSize: 13, color: Colors.light.error, flex: 1 },
  submitBtn: {
    backgroundColor: Colors.light.tint, borderRadius: 14,
    paddingVertical: 17, alignItems: "center",
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 17, color: "#fff" },
  switchText: { textAlign: "center", fontSize: 14, color: Colors.light.textMuted },
  switchLink: { color: Colors.light.tint },
});
