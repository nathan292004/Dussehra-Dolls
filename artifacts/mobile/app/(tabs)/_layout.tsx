import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useCart } from "@/context/cart";

function BadgeDot() {
  return <View style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.light.tint }} />;
}

// iOS-only: uses SF Symbols + Liquid Glass tab bar (iOS 26+)
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Shop</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chits">
        <Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} />
        <Label>Chits</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cart">
        <Icon sf={{ default: "cart", selected: "cart.fill" }} />
        <Label>Cart</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="wallet">
        <Icon sf={{ default: "wallet.pass", selected: "wallet.pass.fill" }} />
        <Label>Wallet</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// Android + Web + older iOS: Ionicons with outline→filled active state
function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const { cart } = useCart();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.light.tint,
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#FFF9F0",
          borderTopWidth: 1,
          borderTopColor: Colors.light.border,
          elevation: 0,
          paddingBottom: isWeb ? 0 : insets.bottom,
          height: isWeb ? 84 : 56 + insets.bottom,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFF9F0" }]} />
          ) : null,
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Shop",
          tabBarIcon: ({ color, size, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "house.fill" : "house"} tintColor={color} size={size} />
            ) : (
              <Ionicons
                name={focused ? "storefront" : "storefront-outline"}
                size={size}
                color={color}
              />
            ),
        }}
      />
      <Tabs.Screen
        name="chits"
        options={{
          title: "Chits",
          tabBarIcon: ({ color, size, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "chart.pie.fill" : "chart.pie"} tintColor={color} size={size} />
            ) : (
              <Ionicons
                name={focused ? "diamond" : "diamond-outline"}
                size={size}
                color={color}
              />
            ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarBadge: cart.itemCount > 0 ? cart.itemCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.light.tint, color: "#fff", fontSize: 10 },
          tabBarIcon: ({ color, size, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "cart.fill" : "cart"} tintColor={color} size={size} />
            ) : (
              <Ionicons
                name={focused ? "bag" : "bag-outline"}
                size={size}
                color={color}
              />
            ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, size, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "wallet.pass.fill" : "wallet.pass"} tintColor={color} size={size} />
            ) : (
              <Ionicons
                name={focused ? "wallet" : "wallet-outline"}
                size={size}
                color={color}
              />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "person.fill" : "person"} tintColor={color} size={size} />
            ) : (
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={size}
                color={color}
              />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  // NativeTabLayout uses SF Symbols which are iOS-only.
  // Explicitly guard with Platform.OS === "ios" so Android never
  // falls into the SF-Symbol path and gets poor-quality fallback glyphs.
  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
