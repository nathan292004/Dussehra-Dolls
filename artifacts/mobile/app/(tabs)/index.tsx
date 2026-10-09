import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { ProductCard } from "@/components/ProductCard";
import { useAuth, getApiBase } from "@/context/auth";
import { useCart } from "@/context/cart";

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
  tags?: string[];
}

const CATEGORIES = ["All", "Traditional", "Modern", "Miniature", "Collector", "Children"];

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addToCart, fetchCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const fetchProducts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "All") params.set("category", selectedCategory);
      if (search) params.set("search", search);
      const res = await fetch(`${getApiBase()}/products?${params}`);
      if (res.ok) setProducts(await res.json());
    } catch { /* ignore */ } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, search]);

  useFocusEffect(useCallback(() => { void fetchProducts(); }, [fetchProducts]));

  const onRefresh = () => { setRefreshing(true); fetchProducts(); };

  const handleAddToCart = async (product: Product) => {
    if (!user) { router.push("/auth"); return; }
    await addToCart(product.id, 1);
    await fetchCart();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const featured = products.filter(p => p.isFeatured);

  const renderHeader = () => (
    <View>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View>
          <Text style={styles.greeting}>Namaste {user?.name?.split(" ")[0] ?? ""}</Text>
          <Text style={styles.headerTitle}>DollDime</Text>
        </View>
        <Pressable style={styles.avatarBtn} onPress={() => router.push("/profile")}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={16} color={Colors.light.tint} />
          </View>
        </Pressable>
      </View>

      <View style={styles.heroBanner}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>FESTIVE SEASON</Text>
        </View>
        <Text style={styles.heroTitle}>Artisan Collection</Text>
        <Text style={styles.heroSubtitle}>Handcrafted dolls from master craftspeople</Text>
        <Pressable style={styles.heroCta}>
          <Text style={styles.heroCtaText}>Explore Now</Text>
        </Pressable>
        <View style={styles.heroCircle1} />
        <View style={styles.heroCircle2} />
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={Colors.light.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search dolls, collections..."
          placeholderTextColor={Colors.light.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={Colors.light.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories} contentContainerStyle={styles.categoriesContent}>
        {CATEGORIES.map(cat => (
          <Pressable
            key={cat}
            style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
            onPress={() => { setSelectedCategory(cat); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {featured.length > 0 && selectedCategory === "All" && !search && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Featured Picks</Text>
            <Text style={styles.seeAll}>See all</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
            {featured.map(p => (
              <View key={p.id} style={{ width: 200 }}>
                <ProductCard
                  product={p}
                  onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })}
                  onAddToCart={() => handleAddToCart(p)}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>All Products</Text>
        <Text style={styles.productCount}>{products.length} items</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.loader, { paddingTop: topPad }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        numColumns={2}
        keyExtractor={item => item.id.toString()}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 118 : 100 + insets.bottom }]}
        columnWrapperStyle={styles.row}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.tint} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={56} color={Colors.light.borderStrong} />
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <ProductCard
              product={item}
              onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
              onAddToCart={() => handleAddToCart(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  greeting: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.text,
    letterSpacing: -0.3,
  },
  avatarBtn: { marginTop: 4 },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    padding: 20,
    overflow: "hidden",
  },
  heroBadge: {
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.cream,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 12,
    color: "rgba(250,250,248,0.6)",
    marginBottom: 14,
  },
  heroCta: {
    backgroundColor: Colors.light.tint,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  heroCtaText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#fff",
  },
  heroCircle1: {
    position: "absolute",
    bottom: -20,
    right: -10,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(46,139,87,0.2)",
  },
  heroCircle2: {
    position: "absolute",
    bottom: 10,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(46,139,87,0.3)",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.border,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  categories: { marginBottom: 4 },
  categoriesContent: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: Colors.light.border,
  },
  categoryChipActive: {
    backgroundColor: "#1A1A1A",
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.light.textSecondary,
  },
  categoryTextActive: { color: Colors.light.cream },
  section: { marginTop: 16, marginBottom: 4 },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.light.text,
  },
  seeAll: {
    fontSize: 11,
    color: Colors.light.tint,
  },
  productCount: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  list: { paddingHorizontal: 16 },
  row: { gap: 12, marginBottom: 12 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: Colors.light.textMuted },
});
