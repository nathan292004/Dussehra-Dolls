import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/context/auth";
import { CartProvider } from "@/context/cart";
import { ErrorBoundary } from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="checkout" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="razorpay-payment" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="payment-result" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        // Preload Ionicons font so icons render correctly on Android
        await Font.loadAsync(Ionicons.font);
      } catch (e) {
        // Font loading error is non-fatal — icons may fall back to placeholders
        console.warn("Font loading error:", e);
      } finally {
        setFontsLoaded(true);
        SplashScreen.hideAsync();
      }
    }
    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={styles.previewBackground}>
    <View style={styles.appFrame} testID="customer-app-frame">
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <CartProvider>
                  <RootLayoutNav />
                </CartProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
    </View>
    </View>
  );
}

// Keep every customer route (including checkout) phone-sized in the web preview.
// Native builds continue to use the device's full screen.
const styles = StyleSheet.create({
  previewBackground: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "#e9e7e2" : "transparent",
    alignItems: "center",
  },
  appFrame: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 430 : undefined,
    overflow: "hidden",
    backgroundColor: "#FAFAF8",
  },
});
