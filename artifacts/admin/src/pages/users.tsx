import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search, UserCheck, UserX } from "lucide-react";

type User = {
  userId: string; index: number; fname: string; lname?: string | null; name: string; phone: string;
  address?: string | null; isReseller: boolean; resellerCode?: string | null; isActive: boolean;
  isDeleted?: boolean; deletedAt?: string | null; deletionReason?: string | null; registeredAt: string;
};

function useUsers() {
  return useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => { const res = await fetch("/api/admin/users"); return res.ok ? res.json() : []; },
    refetchInterval: 30000,
  });
}

export function Users() {
  const { data: users = [], isLoading } = useUsers();
  const [search, setSearch] = React.useState("");

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.userId.toLowerCase().includes(search.toLowerCase()) ||
    (u.resellerCode || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.phone || "").includes(search)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Users</h1>
        <p className="text-warm-secondary mt-1 text-sm">{users.filter(u => !u.isDeleted).length} active customers · {users.filter(u => u.isDeleted).length} closed accounts.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-muted" />
        <input
          type="text"
          placeholder="Search by name, phone or user id..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">#</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">User ID</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Name</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Phone</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Status</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Reseller</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Registered</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-warm-muted">{search ? "No users match your search." : "No users yet."}</td></tr>
              ) : (
                filtered.map(u => (
                  <tr key={u.userId} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3 text-warm-muted text-xs">{u.index}</td>
                    <td className="px-4 py-3 text-warm-secondary text-xs font-mono whitespace-nowrap">{u.userId}</td>
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">{u.name}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{u.phone || "—"}</td>
                    <td className="px-4 py-3">
                      {u.isDeleted ? (
                        <div className="text-warm-muted text-xs font-medium">
                          <div className="flex items-center gap-1.5"><UserX className="w-4 h-4" /> Closed</div>
                          <div className="text-[10px] mt-0.5">
                            {u.deletionReason === "password_reset" ? "Replaced after password reset" : "Deleted by customer"}
                            {u.deletedAt ? ` · ${format(new Date(u.deletedAt), "d/M/yyyy")}` : ""}
                          </div>
                        </div>
                      ) : u.isActive ? (
                        <div className="flex items-center gap-1.5 text-forest text-xs font-medium">
                          <UserCheck className="w-4 h-4" /> Active
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-destructive text-xs font-medium">
                          <UserX className="w-4 h-4" /> Inactive
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-warm-secondary">{u.isReseller ? (u.resellerCode || "Yes") : "—"}</td>
                    <td className="px-4 py-3 text-warm-muted text-xs">{format(new Date(u.registeredAt), "d/M/yyyy")}</td>
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
