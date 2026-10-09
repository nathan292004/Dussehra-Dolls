import React, { useCallback } from "react";
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
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { productImageUrl } from "@/lib/product-image";
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
          <Image source={{ uri: productImageUrl(item.product.imageUrl) }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={28} color={Colors.light.borderStrong} />
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

  useFocusEffect(useCallback(() => {
    void fetchCart();
  }, [fetchCart]));

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.pageTitle}>Cart</Text>
        <View style={styles.emptyState}>
          <Ionicons name="bag-outline" size={52} color={Colors.light.borderStrong} />
          <Text style={styles.emptyTitle}>Sign in to view cart</Text>
          <Text style={styles.emptySubtitle}>Please log in to access your shopping cart</Text>
          <Pressable style={styles.shopNowBtn} onPress={() => router.push("/auth")}>
            <Text style={styles.shopNowBtnText}>Sign In</Text>
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
          <Ionicons name="bag-outline" size={52} color={Colors.light.borderStrong} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Add beautiful dolls to your cart</Text>
          <Pressable style={styles.shopNowBtn} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.shopNowBtnText}>Shop Now</Text>
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
          <Ionicons name="arrow-forward" size={20} color={Colors.light.cream} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.cream },
  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.light.text,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  cartItem: {
    flexDirection: "row",
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  itemImage: {
    width: 90,
    height: 90,
    backgroundColor: Colors.light.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, padding: 12, gap: 3 },
  itemName: { fontSize: 13, fontWeight: "500", color: Colors.light.text },
  itemCategory: { fontSize: 9, color: Colors.light.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  itemPrice: { fontSize: 15, fontWeight: "600", color: Colors.light.text },
  itemActions: {
    padding: 12,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.light.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 4,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
  },
  qty: { fontSize: 14, fontWeight: "500", color: Colors.light.text, minWidth: 20, textAlign: "center" },
  subtotal: { fontSize: 14, fontWeight: "600", color: Colors.light.text },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    padding: 16,
    gap: 12,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 15, color: Colors.light.textSecondary },
  totalAmount: { fontSize: 22, fontWeight: "700", color: Colors.light.text },
  checkoutBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  checkoutText: { fontSize: 16, fontWeight: "500", color: Colors.light.cream },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 100 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: Colors.light.text },
  emptySubtitle: { fontSize: 12, color: Colors.light.textMuted, textAlign: "center" },
  shopNowBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 8,
  },
  shopNowBtnText: { fontSize: 13, fontWeight: "500", color: Colors.light.cream },
});
