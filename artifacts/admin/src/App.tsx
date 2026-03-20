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
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
