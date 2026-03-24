import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useCart } from "@/context/cart";

// Ionicons works perfectly on iOS, Android, and Web.
// expo-symbols (SF Symbols) is iOS-native only — importing it on Android
// crashes the module even when guarded with Platform.OS checks.
// We use Ionicons everywhere for maximum compatibility.

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: {
  name: string;
  title: string;
  iconActive: IoniconsName;
  iconInactive: IoniconsName;
}[] = [
  {
    name: "index",
    title: "Shop",
    iconActive: "storefront",
    iconInactive: "storefront-outline",
  },
  {
    name: "chits",
    title: "Chits",
    iconActive: "diamond",
    iconInactive: "diamond-outline",
  },
  {
    name: "cart",
    title: "Cart",
    iconActive: "bag",
    iconInactive: "bag-outline",
  },
  {
    name: "wallet",
    title: "Wallet",
    iconActive: "wallet",
    iconInactive: "wallet-outline",
  },
  {
    name: "profile",
    title: "Profile",
    iconActive: "person-circle",
    iconInactive: "person-circle-outline",
  },
];

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const { cart } = useCart();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.light.tint,
        tabBarInactiveTintColor: "#9E9E9E",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#FFF9F0",
          borderTopWidth: 1,
          borderTopColor: "#E8D5C4",
          elevation: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          paddingBottom: isWeb ? 0 : isIOS ? insets.bottom : 8,
          paddingTop: 8,
          height: isWeb ? 84 : isIOS ? 56 + insets.bottom : 64,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            ...(tab.name === "cart"
              ? {
                  tabBarBadge: cart.itemCount > 0 ? cart.itemCount : undefined,
                  tabBarBadgeStyle: {
                    backgroundColor: Colors.light.tint,
                    color: "#fff",
                    fontSize: 10,
                  },
                }
              : {}),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? tab.iconActive : tab.iconInactive}
                size={26}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
