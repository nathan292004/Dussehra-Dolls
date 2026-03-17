import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useCart } from "@/context/cart";
import { useAuth } from "@/context/auth";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CartItemRow({ item, onUpdate, onRemove }: { item: any; onUpdate: (qty: number) => void; onRemove: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.cartItem, animStyle]}>
      <View style={styles.itemImage}>
        {item.product?.imageUrl ? (
          <Image source={{ uri: item.product.imageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={28} color={Colors.light.border} />
        )}
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>{item.product?.name}</Text>
        <Text style={styles.itemCategory}>{item.product?.category}</Text>
        <Text style={styles.itemPrice}>₹{item.product?.price?.toFixed(0)}</Text>
      </View>
      <View style={styles.itemActions}>
        <Pressable
          style={styles.removeBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onRemove(); }}
        >
          <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
        </Pressable>
        <View style={styles.qtyRow}>
          <Pressable
            style={styles.qtyBtn}
            onPress={() => { Haptics.selectionAsync(); onUpdate(item.quantity - 1); }}
          >
            <Ionicons name="remove" size={16} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.qty}>{item.quantity}</Text>
          <Pressable
            style={styles.qtyBtn}
            onPress={() => { Haptics.selectionAsync(); onUpdate(item.quantity + 1); }}
          >
            <Ionicons name="add" size={16} color={Colors.light.text} />
          </Pressable>
        </View>
        <Text style={styles.subtotal}>₹{item.subtotal?.toFixed(0)}</Text>
      </View>
    </Animated.View>
  );
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { cart, fetchCart, updateItem, removeItem } = useCart();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (user) fetchCart();
  }, [user]);

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.pageTitle}>Cart</Text>
        <View style={styles.emptyState}>
          <Ionicons name="bag-outline" size={64} color={Colors.light.border} />
          <Text style={styles.emptyTitle}>Sign in to view cart</Text>
          <Text style={styles.emptySubtitle}>Please log in to access your shopping cart</Text>
          <Pressable style={styles.loginBtn} onPress={() => router.push("/auth")}>
            <Text style={styles.loginBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (cart.items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.pageTitle}>Cart</Text>
        <View style={styles.emptyState}>
          <Ionicons name="bag-outline" size={64} color={Colors.light.border} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Add beautiful dolls to your cart</Text>
          <Pressable style={styles.loginBtn} onPress={() => router.push("/(tabs)/")}>
            <Text style={styles.loginBtnText}>Shop Now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <Text style={styles.pageTitle}>Cart ({cart.itemCount})</Text>
      <FlatList
        data={cart.items}
        keyExtractor={item => item.productId.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 160 + bottomPad }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <CartItemRow
            item={item}
            onUpdate={(qty) => updateItem(item.productId, qty)}
            onRemove={() => removeItem(item.productId)}
          />
        )}
      />
      <View style={[styles.footer, { paddingBottom: bottomPad + 80 }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>₹{cart.total.toFixed(0)}</Text>
        </View>
        <Pressable
          style={styles.checkoutBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/checkout");
          }}
        >
          <Text style={styles.checkoutText}>Proceed to Checkout</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  pageTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  cartItem: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
    shadowColor: "#C84B1A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  itemImage: {
    width: 90,
    height: 90,
    backgroundColor: Colors.light.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, padding: 12, gap: 3 },
  itemName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  itemCategory: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.tint },
  itemPrice: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.light.text },
  itemActions: {
    padding: 12,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#FFF0EE",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 4,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  qty: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text, minWidth: 20, textAlign: "center" },
  subtotal: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.tint },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    padding: 16,
    gap: 12,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  totalAmount: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  checkoutBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  checkoutText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 100 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textMuted, textAlign: "center" },
  loginBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
  },
  loginBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
