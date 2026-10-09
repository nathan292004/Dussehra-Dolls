import React from "react";
import { View, Text, StyleSheet, Pressable, Image, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { productImageUrl } from "@/lib/product-image";

interface Product {
  id: number;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  category: string;
  stock: number;
  rating?: number;
  reviewCount?: number;
  isFeatured?: boolean;
}

interface Props {
  product: Product;
  onPress: () => void;
  onAddToCart?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ProductCard({ product, onPress, onAddToCart }: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <AnimatedPressable
      style={[styles.card, animatedStyle]}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.97); }}
      onPressOut={() => { scale.value = withSpring(1); }}
    >
      <View style={styles.imageContainer}>
        {product.imageUrl ? (
          <Image source={{ uri: productImageUrl(product.imageUrl) }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={40} color={Colors.light.borderStrong} />
          </View>
        )}
        {discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{discount}% off</Text>
          </View>
        )}
        {product.isFeatured && (
          <View style={styles.featuredBadge}>
            <Ionicons name="star" size={10} color="#fff" />
          </View>
        )}
        {product.stock > 0 && onAddToCart && (
          <Pressable style={styles.addBtnFloat} onPress={onAddToCart} hitSlop={8}>
            <Ionicons name="add" size={16} color="#fff" />
          </Pressable>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.category}>{product.category}</Text>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={10} color="#D4A853" />
          <Text style={styles.rating}>{(product.rating || 0).toFixed(1)}</Text>
          <Text style={styles.reviewCount}>({product.reviewCount || 0})</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{product.price.toFixed(0)}</Text>
          {product.originalPrice && (
            <Text style={styles.originalPrice}>₹{product.originalPrice.toFixed(0)}</Text>
          )}
        </View>
        {product.stock === 0 && (
          <Text style={styles.outOfStock}>Out of stock</Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
    flex: 1,
    marginBottom: 2,
  },
  imageContainer: {
    position: "relative",
    height: 160,
    backgroundColor: Colors.light.cream,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.cream,
  },
  discountBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#1A1A1A",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  discountText: {
    color: Colors.light.cream,
    fontSize: 9,
    fontWeight: "500",
  },
  featuredBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnFloat: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    padding: 10,
    gap: 2,
  },
  category: {
    fontSize: 9,
    color: Colors.light.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "500",
    marginBottom: 2,
  },
  name: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.light.text,
    lineHeight: 15,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  rating: {
    fontSize: 9,
    color: Colors.light.textMuted,
  },
  reviewCount: {
    fontSize: 9,
    color: Colors.light.textMuted,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  price: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.text,
  },
  originalPrice: {
    fontSize: 9,
    color: Colors.light.textMuted,
    textDecorationLine: "line-through",
  },
  outOfStock: {
    fontSize: 11,
    color: Colors.light.error,
    marginTop: 2,
  },
});
