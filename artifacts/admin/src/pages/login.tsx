import * as React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAdminSession, type AdminInfo } from "@/lib/admin-session";

export function Login({ onLoggedIn }: { onLoggedIn: (admin: AdminInfo) => void }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
        return;
      }
      saveAdminSession(data.token, data.admin);
      onLoggedIn(data.admin);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-parchment px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl border border-warm-border shadow-sm p-8 space-y-5"
      >
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-forest flex items-center justify-center">
            <Lock className="h-5 w-5 text-white" />
          </div>
          <h1 className="font-display text-2xl text-ink" style={{ fontWeight: 700 }}>DollDime Admin</h1>
          <p className="text-sm text-ink/60">Sign in to manage the store</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="username" className="text-sm font-medium text-ink">Username</label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading || !username || !password}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
