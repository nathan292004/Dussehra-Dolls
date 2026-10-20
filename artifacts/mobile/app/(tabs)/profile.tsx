import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, ApiError } from "@/context/auth";

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => { Haptics.selectionAsync(); item.onPress(); }}
    >
      <View style={styles.menuIcon}>
        <Ionicons name={item.icon} size={18} color={Colors.light.tint} />
      </View>
      <View style={styles.menuLabel}>
        <Text style={styles.menuText}>{item.label}</Text>
        {item.subtitle && <Text style={styles.menuSubtitle}>{item.subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.light.borderStrong} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, deleteAccount } = useAuth();
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.signInContainer}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={48} color={Colors.light.borderStrong} />
          </View>
          <Text style={styles.signInTitle}>Welcome to DollDime</Text>
          <Text style={styles.signInSubtitle}>Sign in to manage your account, orders and savings</Text>
          <Pressable style={styles.signInBtn} onPress={() => router.push("/auth")}>
            <Text style={styles.signInBtnText}>Sign In / Register</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleDelete = async () => {
    if (!deletePassword) { setDeleteError("Please enter your password"); return; }
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDelete(false);
      setDeletePassword("");
    } catch (err: any) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete your account. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDeleting(false);
    }
  };

  const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const menuItems: MenuItem[] = [
    {
      icon: "bag-outline",
      label: "My Orders",
      subtitle: "Track and manage your orders",
      onPress: () => router.push("/orders"),
    },
    {
      icon: "wallet-outline",
      label: "Wallet",
      subtitle: "Manage your balance",
      onPress: () => router.push("/(tabs)/wallet"),
    },
    {
      icon: "layers-outline",
      label: "Chit Plans",
      subtitle: "Your savings plans",
      onPress: () => router.push("/(tabs)/chits"),
    },
    {
      icon: "heart-outline",
      label: "Wishlist",
      subtitle: "Saved items",
      onPress: () => {},
    },
    {
      icon: "location-outline",
      label: "Addresses",
      subtitle: "Manage delivery addresses",
      onPress: () => {},
    },
    {
      icon: "notifications-outline",
      label: "Notifications",
      subtitle: "Manage alerts and updates",
      onPress: () => {},
    },
    {
      icon: "help-circle-outline",
      label: "Help & Support",
      subtitle: "FAQs and contact us",
      onPress: () => {},
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <Text style={styles.title}>Profile</Text>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 90 }]}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user.name}</Text>
            {user.phone && <Text style={styles.profilePhone}>{user.phone}</Text>}
          </View>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item) => (
            <MenuRow key={item.label} item={item} />
          ))}
        </View>

        <Pressable
          style={styles.logoutBtn}
          onPress={async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await logout();
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.light.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>

        <Pressable
          style={styles.deleteBtn}
          onPress={() => { Haptics.selectionAsync(); setDeleteError(""); setDeletePassword(""); setShowDelete(true); }}
        >
          <Text style={styles.deleteText}>Delete my account</Text>
        </Pressable>

        <Text style={styles.versionText}>DollDime v1.0.0</Text>
      </ScrollView>

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !deleting && setShowDelete(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalText}>
              Your account will be closed and you will be signed out. Your order history is kept for our records.
              You can register again later with the same number as a new account.
            </Text>
            <Text style={styles.modalText}>
              Accounts with wallet money, savings in a chit plan or an undelivered order cannot be deleted yet.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Enter your password to confirm"
              placeholderTextColor={Colors.light.textMuted}
              secureTextEntry
              autoCapitalize="none"
              editable={!deleting}
            />
            {deleteError ? <Text style={styles.modalError}>{deleteError}</Text> : null}
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowDelete(false)} disabled={deleting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalDeleteBtn, deleting && { opacity: 0.6 }]} onPress={handleDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalDeleteText}>Delete</Text>}
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
  title: {
    fontSize: 20, fontWeight: "700", color: Colors.light.text,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  content: { paddingHorizontal: 16, gap: 16 },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.light.tintLight,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "600", color: Colors.light.tint },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 16, fontWeight: "600", color: Colors.light.text },
  profileEmail: { fontSize: 11, color: Colors.light.textMuted },
  profilePhone: { fontSize: 11, color: Colors.light.textMuted },
  menuSection: {
    backgroundColor: Colors.light.surface, borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.light.border,
  },
  menuRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 14, backgroundColor: Colors.light.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.light.border,
  },
  menuIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.light.tintLight,
    alignItems: "center", justifyContent: "center",
  },
  menuLabel: { flex: 1 },
  menuText: { fontSize: 13, fontWeight: "500", color: Colors.light.text },
  menuSubtitle: { fontSize: 10, color: Colors.light.textMuted, marginTop: 1 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.light.dangerLight, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: "#F5C4B3",
  },
  logoutText: { fontSize: 13, fontWeight: "500", color: Colors.light.error },
  deleteBtn: { alignItems: "center", paddingVertical: 10 },
  deleteText: { fontSize: 12, color: Colors.light.textMuted, textDecorationLine: "underline" },
  overlay: {
    flex: 1, backgroundColor: "rgba(26,26,26,0.5)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.light.surface, borderRadius: 20, padding: 22,
    width: "100%", maxWidth: 380, gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text },
  modalText: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 19 },
  modalInput: {
    borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.light.text,
  },
  modalError: { fontSize: 13, color: Colors.light.error, lineHeight: 18 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 10 },
  modalCancelText: { fontSize: 15, color: Colors.light.textSecondary },
  modalDeleteBtn: { flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: 10, backgroundColor: Colors.light.error },
  modalDeleteText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  versionText: {
    fontSize: 12, color: Colors.light.textMuted,
    textAlign: "center", paddingBottom: 8,
  },
  signInContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32, paddingBottom: 100 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.light.tintLight, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.light.border,
  },
  signInTitle: { fontSize: 18, fontWeight: "600", color: Colors.light.text, textAlign: "center" },
  signInSubtitle: { fontSize: 12, color: Colors.light.textMuted, textAlign: "center", lineHeight: 20 },
  signInBtn: { backgroundColor: "#1A1A1A", borderRadius: 24, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  signInBtnText: { fontSize: 13, fontWeight: "500", color: Colors.light.cream },
});
