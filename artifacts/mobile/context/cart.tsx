import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useAuth, getApiBase } from "./auth";

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

interface CartItem {
  productId: number;
  product: Product;
  quantity: number;
  subtotal: number;
}

interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
}

interface CartContextType {
  cart: Cart;
  isLoading: boolean;
  fetchCart: () => Promise<void>;
  addToCart: (productId: number, quantity?: number) => Promise<void>;
  updateItem: (productId: number, quantity: number) => Promise<void>;
  removeItem: (productId: number) => Promise<void>;
}

const empty: Cart = { items: [], total: 0, itemCount: 0 };
const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [cart, setCart] = useState<Cart>(empty);
  const [isLoading, setIsLoading] = useState(false);

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });

  const fetchCart = useCallback(async () => {
    if (!token) { setCart(empty); return; }
    try {
      setIsLoading(true);
      const res = await fetch(`${getApiBase()}/cart`, { headers: authHeaders() });
      if (res.ok) setCart(await res.json());
    } catch { /* ignore */ } finally { setIsLoading(false); }
  }, [token]);

  const addToCart = useCallback(async (productId: number, quantity = 1) => {
    if (!token) return;
    const res = await fetch(`${getApiBase()}/cart`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ productId, quantity }),
    });
    if (res.ok) setCart(await res.json());
  }, [token]);

  const updateItem = useCallback(async (productId: number, quantity: number) => {
    if (!token) return;
    const res = await fetch(`${getApiBase()}/cart/${productId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ quantity }),
    });
    if (res.ok) setCart(await res.json());
  }, [token]);

  const removeItem = useCallback(async (productId: number) => {
    if (!token) return;
    const res = await fetch(`${getApiBase()}/cart/${productId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) setCart(await res.json());
  }, [token]);

  return (
    <CartContext.Provider value={{ cart, isLoading, fetchCart, addToCart, updateItem, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
