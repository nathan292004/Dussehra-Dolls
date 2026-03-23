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
import { router } from "expo-router";
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

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

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
        <Pressable style={styles.searchIcon} onPress={() => router.push("/profile")}>
          <Ionicons name="person-circle-outline" size={32} color={Colors.light.tint} />
        </Pressable>
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
          <Text style={styles.sectionTitle}>Featured Picks</Text>
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
            <Ionicons name="cube-outline" size={56} color={Colors.light.border} />
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
    backgroundColor: Colors.light.background,
  },
  greeting: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  headerTitle: {
    fontSize: 26,
    color: Colors.light.tint,
    letterSpacing: -0.5,
  },
  searchIcon: { marginTop: 4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    shadowColor: "#C84B1A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
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
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  categoryText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  categoryTextActive: { color: "#fff" },
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
    fontSize: 18,
    color: Colors.light.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  productCount: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  list: { paddingHorizontal: 16 },
  row: { gap: 12, marginBottom: 12 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: Colors.light.textMuted },
});
