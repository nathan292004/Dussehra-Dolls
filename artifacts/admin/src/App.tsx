import * as React from "react";
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
import { ChitApprovals } from "@/pages/chit-approvals";
import { Tracking } from "@/pages/tracking";
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/login";
import {
  getAdminToken,
  getStoredAdmin,
  clearAdminSession,
  onAdminLogout,
  type AdminInfo,
} from "@/lib/admin-session";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Router({ admin, onLogout }: { admin: AdminInfo | null; onLogout: () => void }) {
  return (
    <Layout admin={admin} onLogout={onLogout}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/products" component={Products} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/orders" component={Orders} />
        <Route path="/users" component={Users} />
        <Route path="/chit-approvals" component={ChitApprovals} />
        <Route path="/tracking" component={Tracking} />
        <Route path="/chit-subscriptions" component={ChitSubscriptions} />
        <Route path="/wallets" component={Wallets} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [admin, setAdmin] = React.useState<AdminInfo | null>(() =>
    getAdminToken() ? (getStoredAdmin() ?? { id: 0, username: "admin", name: "Admin" }) : null,
  );

  React.useEffect(
    () =>
      onAdminLogout(() => {
        queryClient.clear();
        setAdmin(null);
      }),
    [],
  );

  if (!admin) {
    return <Login onLoggedIn={setAdmin} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router admin={admin} onLogout={clearAdminSession} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
