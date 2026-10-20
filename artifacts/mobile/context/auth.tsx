import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

interface User {
  id: string; // permanent id, e.g. "user_191026kQzTb"
  userId?: string;
  fname?: string;
  lname?: string | null;
  name: string; // first + last name
  phone?: string | null;
  address?: string | null;
}

/** An error from the API that keeps the server's code (e.g. PHONE_ALREADY_REGISTERED) and details. */
export class ApiError extends Error {
  code?: string;
  reasons?: string[];
  constructor(message: string, code?: string, reasons?: string[]) {
    super(message);
    this.code = code;
    this.reasons = reasons;
  }
}

export type OtpPurpose = "register" | "reset";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (fname: string, lname: string, phone: string, password: string, otp: string) => Promise<void>;
  sendOtp: (phone: string, purpose?: OtpPurpose) => Promise<string | null>;
  resetPassword: (phone: string, otp: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api");

// The login token is kept in the phone's secure storage (Keychain / Keystore).
// The web preview has no secure storage, so it falls back to AsyncStorage.
const storage = {
  get: (key: string) =>
    Platform.OS === "web" ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key),
  set: (key: string, value: string) =>
    Platform.OS === "web" ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value),
  remove: (key: string) =>
    Platform.OS === "web" ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key),
};
const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

async function post(path: string, body: unknown, fallback: string, method = "POST", token?: string | null) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(data?.error || fallback, data?.code, data?.reasons);
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const saveSession = async (data: { token: string; user: User }) => {
    await storage.set(TOKEN_KEY, data.token);
    await storage.set(USER_KEY, JSON.stringify(data.user));
    tokenRef.current = data.token;
    setToken(data.token);
    setUser(data.user);
  };

  const clearSession = async () => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    try {
      await storage.remove(TOKEN_KEY);
      await storage.remove(USER_KEY);
    } catch { /* nothing stored */ }
  };

  // Restore the saved login, and check with the server that it is still valid.
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await storage.get(TOKEN_KEY);
        const storedUser = await storage.get(USER_KEY);
        if (storedToken && storedUser) {
          tokenRef.current = storedToken;
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${storedToken}` } });
          if (res.status === 401) await clearSession(); // expired, or an old-style token
        }
      } catch {
        // offline or unreadable: stay signed out/in as stored
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // If the server ever says our token is no longer valid (expired, account deleted),
  // sign out instead of leaving the app in a broken half-signed-in state.
  useEffect(() => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const res = await original(input, init);
      try {
        const url = typeof input === "string" ? input : input?.url ?? String(input);
        const sent = init?.headers?.Authorization;
        if (
          res.status === 401 &&
          url.startsWith(API_BASE) &&
          sent && tokenRef.current && sent === `Bearer ${tokenRef.current}`
        ) {
          void clearSession();
        }
      } catch { /* never break a request because of this check */ }
      return res;
    }) as typeof fetch;
    return () => { globalThis.fetch = original; };
  }, []);

  const sendOtp = async (phone: string, purpose: OtpPurpose = "register") => {
    const data = await post("/auth/send-otp", { phone, purpose }, "Failed to send OTP");
    return data?.developmentOtp ?? null;
  };

  const login = async (phone: string, password: string) => {
    await saveSession(await post("/auth/login", { phone, password }, "Login failed"));
  };

  const register = async (fname: string, lname: string, phone: string, password: string, otp: string) => {
    await saveSession(await post("/auth/register", { fname, lname, phone, password, otp }, "Registration failed"));
  };

  const resetPassword = async (phone: string, otp: string, newPassword: string) => {
    await saveSession(await post("/auth/reset-password", { phone, otp, newPassword }, "Could not reset password"));
  };

  const deleteAccount = async (password: string) => {
    await post("/auth/account", { password }, "Could not delete account", "DELETE", tokenRef.current);
    await clearSession();
  };

  const logout = clearSession;

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, sendOtp, resetPassword, deleteAccount, logout }}
    >
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
  return API_BASE;
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await storage.get(TOKEN_KEY);
  } catch {
    return null;
  }
}
