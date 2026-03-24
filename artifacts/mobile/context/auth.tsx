import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (name: string, phone: string, password: string, otp: string) => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem("auth_token");
        const storedUser = await AsyncStorage.getItem("auth_user");
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const sendOtp = async (phone: string) => {
    const res = await fetch(`${API_BASE}/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to send OTP");
    }
  };

  const login = async (phone: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Login failed");
    }
    const data = await res.json();
    await AsyncStorage.setItem("auth_token", data.token);
    await AsyncStorage.setItem("auth_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (name: string, phone: string, password: string, otp: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, password, otp }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Registration failed");
    }
    const data = await res.json();
    await AsyncStorage.setItem("auth_token", data.token);
    await AsyncStorage.setItem("auth_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    await AsyncStorage.removeItem("auth_token");
    await AsyncStorage.removeItem("auth_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, sendOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function getApiBase() {
  return process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api";
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem("auth_token");
  } catch {
    return null;
  }
}
