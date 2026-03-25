import * as React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ShoppingBag, Package, Truck, Users, Wallet,
  Gift, LogOut, Menu, X, ListOrdered, Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Package, label: "Products", href: "/products" },
  { icon: Truck, label: "Vendors", href: "/vendors" },
  { icon: Store, label: "Inventory", href: "/inventory" },
  { icon: ListOrdered, label: "Orders", href: "/orders" },
  { icon: Users, label: "Users", href: "/users" },
  { icon: Gift, label: "Chit Plans", href: "/chit-plans" },
  { icon: ShoppingBag, label: "Chit Subscriptions", href: "/chit-subscriptions" },
  { icon: Wallet, label: "Wallets", href: "/wallets" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  const SidebarContent = () => (
    <>
      <div className="p-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-forest p-0.5 shadow-lg flex items-center justify-center">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 object-contain" />
        </div>
        <div>
          <h1 className="font-display text-lg text-white tracking-wide" style={{ fontWeight: 700 }}>DollDime</h1>
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">Admin Portal</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 cursor-pointer group relative overflow-hidden",
                  isActive
                    ? "text-white bg-forest/12"
                    : "text-white/60 hover:bg-white/6 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div layoutId="activeTab" className="absolute left-0 top-0 bottom-0 w-[3px] bg-forest rounded-r" />
                )}
                <item.icon className={cn("h-4 w-4", isActive ? "text-white" : "text-white/60 group-hover:text-white")} />
                <span className={cn("text-sm", isActive ? "font-medium" : "")}>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 mt-auto">
        <div className="flex items-center gap-3 px-4 py-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-forest flex items-center justify-center">
            <span className="text-white text-xs font-medium">AD</span>
          </div>
          <div>
            <p className="text-xs text-white font-medium">Admin</p>
            <p className="text-[10px] text-white/50">Administrator</p>
          </div>
        </div>
        <button className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:bg-white/6 hover:text-white transition-colors">
          <LogOut className="h-4 w-4" />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-parchment">
      <aside className="hidden lg:flex w-60 flex-col bg-ink sticky top-0 h-screen overflow-y-auto">
        <SidebarContent />
      </aside>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-cream z-40 flex items-center justify-between px-4 border-b border-warm-border">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 object-contain" />
          <span className="font-display text-ink" style={{ fontWeight: 700 }}>DollDime</span>
        </div>
        <button onClick={() => setIsMobileOpen(true)} className="text-ink p-2"><Menu className="h-6 w-6" /></button>
      </div>

      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink/50 z-50 lg:hidden backdrop-blur-sm"
              onClick={() => setIsMobileOpen(false)} />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-60 bg-ink z-50 flex flex-col shadow-2xl lg:hidden"
            >
              <div className="absolute top-4 right-4">
                <button onClick={() => setIsMobileOpen(false)} className="text-white/60 hover:text-white p-2">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <div className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full bg-cream min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
