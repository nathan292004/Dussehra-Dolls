import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { Dashboard } from "@/pages/dashboard";
import { Products } from "@/pages/products";
import { Vendors } from "@/pages/vendors";
import { Inventory } from "@/pages/inventory";
import { Orders } from "@/pages/orders";
import { Users } from "@/pages/users";
import { ChitSubscriptions } from "@/pages/chit-subscriptions";
import { Wallets } from "@/pages/wallets";
import { ChitPlans } from "@/pages/chit-plans";
import NotFound from "@/pages/not-found";
import { WhatsApp } from "@/pages/whatsapp";
import { useEffect, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/products" component={Products} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/orders" component={Orders} />
        <Route path="/users" component={Users} />
        <Route path="/chit-plans" component={ChitPlans} />
        <Route path="/chit-subscriptions" component={ChitSubscriptions} />
        <Route path="/wallets" component={Wallets} />
        <Route path="/whatsapp" component={WhatsApp} />
        <Route path="/promotions" component={WhatsApp} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/admin/auth/me").then(response => setAuthenticated(response.ok)).catch(() => setAuthenticated(false)); }, []);
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const response = await fetch("/api/admin/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Login failed"); }
      setPassword(""); setAuthenticated(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Login failed"); }
  };
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {authenticated === null ? <div className="p-8">Checking admin access…</div> : authenticated ? <Router /> :
            <main className="min-h-screen flex items-center justify-center bg-parchment p-4">
              <form onSubmit={login} className="bg-white rounded-2xl border border-warm-border shadow p-8 w-full max-w-sm space-y-4">
                <h1 className="text-2xl font-semibold">DollDime Admin</h1>
                <p className="text-sm text-warm-secondary">Sign in to manage orders, inventory and messages.</p>
                <input className="w-full border rounded-lg p-3" type="email" autoComplete="username" placeholder="Admin email" value={email} onChange={event => setEmail(event.target.value)} required />
                <input className="w-full border rounded-lg p-3" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required />
                <button className="w-full rounded-lg bg-foreground text-white p-3">Sign in</button>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              </form>
            </main>}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
