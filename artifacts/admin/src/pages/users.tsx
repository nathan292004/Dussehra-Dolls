import * as React from "react";
import { Search, UserCheck, UserX, MapPin } from "lucide-react";
import { formatIST } from "@/lib/time";
import { usePaged } from "@/hooks/use-paged";
import { Pager } from "@/components/pager";

type User = {
  userId: string; index: number; fname: string; lname?: string | null; name: string; phone: string;
  address?: string | null; addressLink?: string | null; isReseller: boolean; resellerCode?: string | null; isActive: boolean;
  isDeleted?: boolean; deletedAt?: string | null; deletionReason?: string | null; registeredAt: string; lastActiveAt?: string | null;
};

const TH = "px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium";

export function Users() {
  const [status, setStatus] = React.useState("all");
  const list = usePaged<User>("/api/admin/users", { params: { status }, refetchInterval: 30000 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Users</h1>
        <p className="text-warm-secondary mt-1 text-sm">{list.data.total.toLocaleString("en-IN")} {status === "all" ? "accounts" : status + " accounts"}. Times are in IST.</p>
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-warm-border bg-white text-sm outline-none">
          <option value="all">All accounts</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className={TH}>#</th>
                <th className={TH}>User ID</th>
                <th className={TH}>Name</th>
                <th className={TH}>Phone</th>
                <th className={TH}>Address</th>
                <th className={TH}>Status</th>
                <th className={TH}>Reseller</th>
                <th className={TH}>Registered</th>
                <th className={TH}>Last active</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : list.isError ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-destructive">{(list.error as Error).message}</td></tr>
              ) : list.items.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-warm-muted">{list.search || status !== "all" ? "No users match your search." : "No users yet."}</td></tr>
              ) : (
                list.items.map((u) => (
                  <tr key={u.userId} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3 text-warm-muted text-xs">{u.index}</td>
                    <td className="px-4 py-3 text-warm-secondary text-xs font-mono whitespace-nowrap">{u.userId}</td>
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">{u.name}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{u.phone || "—"}</td>
                    <td className="px-4 py-3 text-xs text-warm-secondary max-w-64">
                      {u.address ? (
                        <>
                          <div className="line-clamp-2">{u.address}</div>
                          {u.addressLink && (
                            <a href={u.addressLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-forest underline mt-0.5">
                              <MapPin className="w-3 h-3" /> Open in Google Maps
                            </a>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.isDeleted ? (
                        <div className="text-warm-muted text-xs font-medium">
                          <div className="flex items-center gap-1.5"><UserX className="w-4 h-4" /> Closed</div>
                          <div className="text-[10px] mt-0.5">
                            {u.deletionReason === "password_reset" ? "Replaced after password reset" : "Deleted by customer"}
                            {u.deletedAt ? ` · ${formatIST(u.deletedAt, "d/M/yyyy")}` : ""}
                          </div>
                        </div>
                      ) : u.isActive ? (
                        <div className="flex items-center gap-1.5 text-forest text-xs font-medium"><UserCheck className="w-4 h-4" /> Active</div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-destructive text-xs font-medium"><UserX className="w-4 h-4" /> Inactive</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-warm-secondary">{u.isReseller ? (u.resellerCode || "Yes") : "—"}</td>
                    <td className="px-4 py-3 text-warm-muted text-xs whitespace-nowrap">{formatIST(u.registeredAt, "d/M/yyyy")}</td>
                    <td className="px-4 py-3 text-warm-muted text-xs whitespace-nowrap">{formatIST(u.lastActiveAt, "d/M/yyyy")}</td>
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
