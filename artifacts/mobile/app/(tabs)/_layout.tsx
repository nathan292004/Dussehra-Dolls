import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useCart } from "@/context/cart";

// On Android: always solid/filled icons — active = brand color, inactive = muted grey
// On iOS: SF Symbols with fill state
// This guarantees crisp, professional icons on every platform
type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: {
  name: string;
  title: string;
  iosFilled: string;
  iosOutline: string;
  androidIcon: IoniconsName;
}[] = [
  {
    name: "index",
    title: "Shop",
    iosFilled: "storefront.fill",
    iosOutline: "storefront",
    androidIcon: "storefront",
  },
  {
    name: "chits",
    title: "Chits",
    iosFilled: "chart.pie.fill",
    iosOutline: "chart.pie",
    androidIcon: "diamond",
  },
  {
    name: "cart",
    title: "Cart",
    iosFilled: "cart.fill",
    iosOutline: "cart",
    androidIcon: "bag",
  },
  {
    name: "wallet",
    title: "Wallet",
    iosFilled: "wallet.pass.fill",
    iosOutline: "wallet.pass",
    androidIcon: "wallet",
  },
  {
    name: "profile",
    title: "Profile",
    iosFilled: "person.fill",
    iosOutline: "person",
    androidIcon: "person",
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
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#FFF9F0",
          borderTopWidth: 1,
          borderTopColor: Colors.light.border,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          paddingBottom: isWeb ? 0 : isIOS ? insets.bottom : 6,
          paddingTop: 6,
          height: isWeb ? 84 : isIOS ? 56 + insets.bottom : 62,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
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
            tabBarIcon: ({ color, focused }) => {
              if (isIOS) {
                return (
                  <SymbolView
                    name={focused ? tab.iosFilled : tab.iosOutline}
                    tintColor={color}
                    size={26}
                  />
                );
              }
              // Android & Web: always solid filled, rely on color for active/inactive
              return (
                <Ionicons
                  name={tab.androidIcon}
                  size={26}
                  color={color}
                />
              );
            },
          }}
        />
      ))}
    </Tabs>
  );
}
