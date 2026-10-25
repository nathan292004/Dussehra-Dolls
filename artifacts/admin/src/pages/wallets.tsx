import * as React from "react";
import { Wallet, Lock, LockOpen, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatIST } from "@/lib/time";
import { usePaged } from "@/hooks/use-paged";
import { Pager } from "@/components/pager";

type WalletEntry = {
  id: number;
  userId: string;
  balance: number;
  chitLockedBalance?: number;
  isReleased: boolean;
  releasedAt?: string | null;
  updatedAt: string;
  userName?: string | null;
  userPhone?: string | null;
};

const TH = "px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium";

export function Wallets() {
  const [released, setReleased] = React.useState("all");
  const list = usePaged<WalletEntry>("/api/admin/wallets", { params: { released }, refetchInterval: 30000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Wallets</h1>
        <p className="text-warm-secondary mt-1 text-sm">
          {list.data.total.toLocaleString("en-IN")} wallets. A wallet is <strong>released</strong> (can be spent) once the customer&apos;s last chit payment is made; until then it stays closed.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-muted" />
          <input
            type="text"
            placeholder="Search by name, phone or user id..."
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
          />
        </div>
        <select value={released} onChange={(e) => setReleased(e.target.value)} className="px-3 py-2 rounded-lg border border-warm-border bg-white text-sm outline-none">
          <option value="all">All wallets</option>
          <option value="true">Released</option>
          <option value="false">Closed (chit payments pending)</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className={TH}>User</th>
                <th className={TH}>Phone</th>
                <th className={TH}>Balance</th>
                <th className={TH}>Locked in chits</th>
                <th className={TH}>Released</th>
                <th className={TH}>Last updated (IST)</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : list.isError ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-destructive">{(list.error as Error).message}</td></tr>
              ) : list.items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-warm-muted">No wallets found.</td></tr>
              ) : (
                list.items.map((w) => (
                  <tr key={w.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-forest-light flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-forest" />
                        </div>
                        <div>
                          <div>{w.userName ?? "Unknown"}</div>
                          <div className="text-[10px] font-mono text-warm-muted">{w.userId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{w.userPhone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`font-display ${w.balance > 0 ? "text-forest" : "text-warm-muted"}`} style={{ fontWeight: 600 }}>
                        {formatCurrency(w.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{(w.chitLockedBalance ?? 0) > 0 ? formatCurrency(w.chitLockedBalance!) : "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {w.isReleased ? (
                        <span className="inline-flex items-center gap-1 text-forest font-medium"><LockOpen className="w-3.5 h-3.5" /> Released{w.releasedAt ? ` · ${formatIST(w.releasedAt, "d MMM yyyy")}` : ""}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium"><Lock className="w-3.5 h-3.5" /> Closed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warm-muted text-xs whitespace-nowrap">{formatIST(w.updatedAt, "d MMM yyyy, h:mm a")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pageSize={list.pageSize} total={list.data.total} totalPages={list.data.totalPages} onPage={list.setPage} busy={list.isFetching} />
      </div>
    </div>
  );
}
