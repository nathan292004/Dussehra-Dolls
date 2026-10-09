import { getApiBase } from "@/context/auth";

// Relative upload paths work with the local browser and with the phone's LAN API.
export function productImageUrl(url: string): string {
  if (!url.startsWith("/api/uploads/")) return url;
  const apiBase = getApiBase();
  return apiBase.startsWith("http")
    ? new URL(url, apiBase).href
    : url;
}
