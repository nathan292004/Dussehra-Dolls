import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/auth";

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
      <View style={[styles.menuIcon, { backgroundColor: (item.color || Colors.light.tint) + "18" }]}>
        <Ionicons name={item.icon} size={20} color={item.color || Colors.light.tint} />
      </View>
      <View style={styles.menuLabel}>
        <Text style={styles.menuText}>{item.label}</Text>
        {item.subtitle && <Text style={styles.menuSubtitle}>{item.subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.light.textMuted} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.signInContainer}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={48} color={Colors.light.border} />
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
      icon: "chart-pie-outline" as any,
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
            <Text style={styles.profileEmail}>{user.email}</Text>
            {user.phone && <Text style={styles.profilePhone}>{user.phone}</Text>}
          </View>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <React.Fragment key={item.label}>
              <MenuRow item={item} />
              {index < menuItems.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
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

        <Text style={styles.versionText}>DollDime v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  title: {
    fontSize: 26, color: Colors.light.text,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  content: { paddingHorizontal: 16, gap: 20 },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: "#fff", borderRadius: 20, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.light.tint,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 24, color: "#fff" },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: 20, color: Colors.light.text },
  profileEmail: { fontSize: 13, color: Colors.light.textMuted },
  profilePhone: { fontSize: 13, color: Colors.light.textMuted },
  menuSection: {
    backgroundColor: "#fff", borderRadius: 20, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  menuRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, backgroundColor: "#fff",
  },
  menuIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  menuLabel: { flex: 1 },
  menuText: { fontSize: 15, color: Colors.light.text },
  menuSubtitle: { fontSize: 12, color: Colors.light.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: Colors.light.border, marginLeft: 68 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#FFF0EE", borderRadius: 16, paddingVertical: 16,
    borderWidth: 1, borderColor: "#FCCFC9",
  },
  logoutText: { fontSize: 16, color: Colors.light.error },
  versionText: {
    fontSize: 12, color: Colors.light.textMuted,
    textAlign: "center", paddingBottom: 8,
  },
  signInContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32, paddingBottom: 100 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.light.cream, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.light.border,
  },
  signInTitle: { fontSize: 22, color: Colors.light.text, textAlign: "center" },
  signInSubtitle: { fontSize: 14, color: Colors.light.textMuted, textAlign: "center", lineHeight: 22 },
  signInBtn: { backgroundColor: Colors.light.tint, borderRadius: 14, paddingHorizontal: 40, paddingVertical: 16, marginTop: 8 },
  signInBtnText: { fontSize: 16, color: "#fff" },
});
