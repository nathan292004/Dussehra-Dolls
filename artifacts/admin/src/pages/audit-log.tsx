import * as React from "react";
import { Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { formatIST } from "@/lib/time";
import { usePaged } from "@/hooks/use-paged";
import { Pager } from "@/components/pager";

type Entry = {
  id: number;
  adminUsername: string | null;
  action: string;
  method: string | null;
  path: string | null;
  entityType: string | null;
  entityId: string | null;
  statusCode: number | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

const TH = "px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium";

function Outcome({ entry }: { entry: Entry }) {
  const failed = entry.action === "login_failed" || entry.action === "login_locked" || (entry.statusCode ?? 200) >= 400;
  return failed ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><ShieldAlert className="w-3.5 h-3.5" /> Failed{entry.statusCode ? ` (${entry.statusCode})` : ""}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-forest"><ShieldCheck className="w-3.5 h-3.5" /> OK</span>
  );
}

export function AuditLog() {
  const list = usePaged<Entry>("/api/admin/auth/audit-log", { pageSize: 50, refetchInterval: 30000 });
  const [open, setOpen] = React.useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-ink">Audit Log</h1>
        <p className="text-warm-secondary mt-1 text-sm">
          Every admin sign-in and every change made in this site, newest first. Passwords are never recorded. Times are in IST.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-muted" />
        <input
          type="text"
          placeholder="Search action, page or username..."
          value={list.search}
          onChange={(e) => list.setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className={TH}>When (IST)</th>
                <th className={TH}>Admin</th>
                <th className={TH}>Action</th>
                <th className={TH}>Item</th>
                <th className={TH}>Result</th>
                <th className={TH}>From</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : list.isError ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-destructive">{(list.error as Error).message}</td></tr>
              ) : list.items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">Nothing recorded yet.</td></tr>
              ) : (
                list.items.map((e) => (
                  <React.Fragment key={e.id}>
                    <tr className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors align-top">
                      <td className="px-4 py-3 text-xs text-warm-secondary whitespace-nowrap">{formatIST(e.createdAt, "d MMM yyyy, h:mm:ss a")}</td>
                      <td className="px-4 py-3 text-[13px] text-ink">{e.adminUsername ?? "—"}</td>
                      <td className="px-4 py-3 text-[13px] font-mono text-ink">{e.action}</td>
                      <td className="px-4 py-3 text-xs text-warm-secondary">{e.entityType ? `${e.entityType}${e.entityId ? ` #${e.entityId}` : ""}` : "—"}</td>
                      <td className="px-4 py-3"><Outcome entry={e} /></td>
                      <td className="px-4 py-3 text-xs text-warm-muted font-mono">{e.ip ?? "—"}</td>
                      <td className="px-4 py-3">
                        {e.details ? (
                          <button onClick={() => setOpen(open === e.id ? null : e.id)} className="text-xs text-forest underline">
                            {open === e.id ? "Hide" : "Details"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {open === e.id && e.details && (
                      <tr className="bg-parchment/50">
                        <td colSpan={7} className="px-4 py-3">
                          <p className="text-[11px] text-warm-muted mb-1">{e.method} {e.path}</p>
                          <pre className="text-xs text-ink whitespace-pre-wrap break-all">{JSON.stringify(e.details, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
