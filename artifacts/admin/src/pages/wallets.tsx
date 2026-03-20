import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type WalletEntry = {
  id: number;
  userId: number;
  balance: number;
  updatedAt: string;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
};

function useWallets() {
  return useQuery<WalletEntry[]>({
    queryKey: ["/api/admin/wallets"],
    queryFn: async () => { const res = await fetch("/api/admin/wallets"); return res.ok ? res.json() : []; },
    refetchInterval: 30000,
  });
}

export function Wallets() {
  const { data: wallets = [], isLoading } = useWallets();

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Wallets</h1>
        <p className="text-muted-foreground mt-1">{wallets.length} active wallets · Total balance: {formatCurrency(totalBalance)}</p>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Balance</th>
                <th className="px-4 py-3 text-left">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : wallets.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No wallets found.</td></tr>
              ) : (
                wallets.map(w => (
                  <tr key={w.id} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-primary" />
                        </div>
                        {w.userName ?? `User #${w.userId}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{w.userEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{w.userPhone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${w.balance > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                        {formatCurrency(w.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{format(new Date(w.updatedAt), "d/M/yyyy")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
