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
        <h1 className="text-3xl text-ink">Wallets</h1>
        <p className="text-warm-secondary mt-1 text-sm">{wallets.length} active wallets · Total balance: {formatCurrency(totalBalance)}</p>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">User</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Email</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Phone</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Balance</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : wallets.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-warm-muted">No wallets found.</td></tr>
              ) : (
                wallets.map(w => (
                  <tr key={w.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-forest-light flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-forest" />
                        </div>
                        {w.userName ?? `User #${w.userId}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{w.userEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{w.userPhone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`font-display ${w.balance > 0 ? "text-forest" : "text-warm-muted"}`} style={{ fontWeight: 600 }}>
                        {formatCurrency(w.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-muted text-xs">{format(new Date(w.updatedAt), "d/M/yyyy")}</td>
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
