import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useCart } from "@/context/cart";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface TabConfig {
  name: string;
  title: string;
  icon: IoniconsName;
  iconFocused: IoniconsName;
}

const TABS: TabConfig[] = [
  { name: "index",   title: "Shop",    icon: "home-outline",   iconFocused: "home" },
  { name: "chits",   title: "Chits",   icon: "layers-outline", iconFocused: "layers" },
  { name: "cart",    title: "Cart",    icon: "cart-outline",   iconFocused: "cart" },
  { name: "wallet",  title: "Wallet",  icon: "cash-outline",   iconFocused: "cash" },
  { name: "profile", title: "Profile", icon: "person-outline",  iconFocused: "person" },
];

// Custom icon wrapper — adds a visible pill indicator behind the active icon
function TabIcon({
  iconName,
  color,
  focused,
}: {
  iconName: IoniconsName;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
      <Ionicons name={iconName} size={22} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const { cart } = useCart();

  const tabBarHeight = isWeb ? 72 : isIOS ? 56 + insets.bottom : 60;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.light.tint,
        tabBarInactiveTintColor: "#9E9E99",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E8E8E3",
          height: tabBarHeight,
          paddingBottom: isWeb ? 4 : isIOS ? insets.bottom : 8,
          paddingTop: 4,
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          marginTop: 0,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            ...(tab.name === "cart" && {
              tabBarBadge: cart.itemCount > 0 ? cart.itemCount : undefined,
              tabBarBadgeStyle: {
                backgroundColor: Colors.light.tint,
                color: "#fff",
                fontSize: 9,
                minWidth: 16,
                height: 16,
                lineHeight: 16,
              },
            }),
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                iconName={focused ? tab.iconFocused : tab.icon}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 40,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapperActive: {
    backgroundColor: "rgba(46,139,87,0.15)",
  },
});
