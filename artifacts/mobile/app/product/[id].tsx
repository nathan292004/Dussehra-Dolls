import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, getApiBase } from "@/context/auth";
import { useCart } from "@/context/cart";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  category: string;
  stock: number;
  rating?: number;
  reviewCount?: number;
  isFeatured?: boolean;
  tags?: string[];
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addToCart, fetchCart } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/products/${id}`);
        if (res.ok) setProduct(await res.json());
      } catch { /* ignore */ } finally { setIsLoading(false); }
    })();
  }, [id]);

  const handleAddToCart = async () => {
    if (!user) { router.push("/auth"); return; }
    setAdding(true);
    try {
      await addToCart(product!.id, quantity);
      await fetchCart();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/(tabs)/cart");
    } catch { /* ignore */ } finally { setAdding(false); }
  };

  const discount = product?.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.loader}>
        <Text style={styles.errorText}>Product not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad + 120 }}>
        <View style={styles.imageContainer}>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={80} color={Colors.light.border} />
            </View>
          )}
          <Pressable
            style={[styles.backBtn, { top: topPad + 12 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.light.text} />
          </Pressable>
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{discount}% OFF</Text>
            </View>
          )}
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.categoryRow}>
            <Text style={styles.category}>{product.category}</Text>
            {product.isFeatured && (
              <View style={styles.featuredBadge}>
                <Ionicons name="star" size={12} color={Colors.light.gold} />
                <Text style={styles.featuredText}>Featured</Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{product.name}</Text>

          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <Ionicons
                key={star}
                name={star <= Math.round(product.rating || 0) ? "star" : "star-outline"}
                size={16}
                color={Colors.light.gold}
              />
            ))}
            <Text style={styles.rating}>{(product.rating || 0).toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({product.reviewCount || 0} reviews)</Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{product.price.toFixed(0)}</Text>
            {product.originalPrice && (
              <Text style={styles.originalPrice}>₹{product.originalPrice.toFixed(0)}</Text>
            )}
            {discount > 0 && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>Save ₹{(product.originalPrice! - product.price).toFixed(0)}</Text>
              </View>
            )}
          </View>

          {product.description && (
            <View style={styles.descSection}>
              <Text style={styles.descTitle}>Description</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          {product.tags && product.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.descTitle}>Tags</Text>
              <View style={styles.tagsRow}>
                {product.tags.map(tag => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.stockRow, { backgroundColor: product.stock > 0 ? "#E8F8EE" : "#FFF0EE" }]}>
            <Ionicons
              name={product.stock > 0 ? "checkmark-circle" : "close-circle"}
              size={18}
              color={product.stock > 0 ? Colors.light.success : Colors.light.error}
            />
            <Text style={[styles.stockText, { color: product.stock > 0 ? Colors.light.success : Colors.light.error }]}>
              {product.stock > 0 ? `In Stock (${product.stock} available)` : "Out of Stock"}
            </Text>
          </View>
        </View>
      </ScrollView>

      {product.stock > 0 && (
        <View style={[styles.footer, { paddingBottom: bottomPad + 76 }]}>
          <View style={styles.qtyRow}>
            <Pressable style={styles.qtyBtn} onPress={() => quantity > 1 && setQuantity(q => q - 1)}>
              <Ionicons name="remove" size={18} color={Colors.light.text} />
            </Pressable>
            <Text style={styles.qty}>{quantity}</Text>
            <Pressable style={styles.qtyBtn} onPress={() => quantity < product.stock && setQuantity(q => q + 1)}>
              <Ionicons name="add" size={18} color={Colors.light.text} />
            </Pressable>
          </View>
          <Pressable style={[styles.addBtn, adding && styles.addBtnDisabled]} onPress={handleAddToCart} disabled={adding}>
            {adding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="bag-add-outline" size={20} color="#fff" />
                <Text style={styles.addBtnText}>Add to Cart · ₹{(product.price * quantity).toFixed(0)}</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  errorText: { fontSize: 16, color: Colors.light.textMuted },
  imageContainer: { height: 340, backgroundColor: Colors.light.cream, position: "relative" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: {
    position: "absolute", left: 16, width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  discountBadge: {
    position: "absolute", bottom: 16, right: 16,
    backgroundColor: Colors.light.tint, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  discountText: { color: "#fff", fontSize: 13 },
  detailsContainer: { padding: 24, gap: 16 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  category: {
    fontSize: 11, color: Colors.light.tint,
    textTransform: "uppercase", letterSpacing: 1,
  },
  featuredBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.light.cream, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  featuredText: { fontSize: 11, color: Colors.light.gold },
  name: { fontSize: 24, color: Colors.light.text, lineHeight: 32 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  rating: { fontSize: 14, color: Colors.light.textSecondary, marginLeft: 4 },
  reviewCount: { fontSize: 13, color: Colors.light.textMuted },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  price: { fontSize: 32, color: Colors.light.text },
  originalPrice: { fontSize: 18, color: Colors.light.textMuted, textDecorationLine: "line-through" },
  savingsBadge: { backgroundColor: "#E8F8EE", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  savingsText: { fontSize: 12, color: Colors.light.success },
  descSection: { gap: 8 },
  descTitle: { fontSize: 15, color: Colors.light.text },
  description: { fontSize: 14, color: Colors.light.textSecondary, lineHeight: 22 },
  tagsSection: { gap: 8 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: Colors.light.cream, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { fontSize: 12, color: Colors.light.textSecondary },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 12 },
  stockText: { fontSize: 13, },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: Colors.light.border,
    padding: 16, flexDirection: "row", gap: 12, alignItems: "center",
  },
  qtyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.light.surface, borderRadius: 14, padding: 8,
  },
  qtyBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", shadowColor: "#C84B1A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  qty: { fontSize: 17, color: Colors.light.text, minWidth: 24, textAlign: "center" },
  addBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.light.tint, borderRadius: 14, paddingVertical: 16,
    shadowColor: Colors.light.tint, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { fontSize: 16, color: "#fff" },
});
