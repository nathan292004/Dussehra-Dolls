const TOKEN_KEY = "dolldime_admin_token";
const ADMIN_KEY = "dolldime_admin_user";
const LOGOUT_EVENT = "dolldime-admin-logout";
const NOTICE_KEY = "dolldime_admin_notice";

export interface AdminInfo {
  id: number;
  username: string;
  name: string;
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredAdmin(): AdminInfo | null {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    return raw ? (JSON.parse(raw) as AdminInfo) : null;
  } catch {
    return null;
  }
}

export function saveAdminSession(token: string, admin: AdminInfo) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  } catch {
    /* storage unavailable */
  }
}

export function clearAdminSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}

/** Tells the server to end the session (so the token stops working everywhere), then clears it here. */
export async function logoutAdmin() {
  const token = getAdminToken();
  try {
    if (token) await fetch("/api/admin/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* offline: still sign out on this device */
  }
  clearAdminSession();
}

/** Why the admin was signed out automatically (shown once on the login page), if there was a reason. */
export function takeLogoutNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

function rememberLogoutNotice(message: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    /* storage unavailable */
  }
}

export function onAdminLogout(handler: () => void): () => void {
  window.addEventListener(LOGOUT_EVENT, handler);
  return () => window.removeEventListener(LOGOUT_EVENT, handler);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname;
  return input.url;
}

/**
 * Makes every request to /api/admin/* carry the admin token, and signs the admin
 * out automatically when the server says the session is no longer valid.
 */
export function installAdminFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = requestUrl(input);
    const isAdminApi = url.startsWith("/api/admin/") && !url.startsWith("/api/admin/auth/login");
    if (!isAdminApi) return originalFetch(input, init);

    const token = getAdminToken();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await originalFetch(input, { ...init, headers });
    if (res.status === 401) {
      const body = await res.clone().json().catch(() => null);
      if (body?.code === "SESSION_REPLACED") rememberLogoutNotice(body.error);
      else if (body?.error) rememberLogoutNotice(body.error);
      clearAdminSession();
    }
    return res;
  };
}
