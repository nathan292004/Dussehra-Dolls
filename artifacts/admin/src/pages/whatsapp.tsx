import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  MessageCircle,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Template = {
  name: string;
  language: string;
  status: string;
  category: string;
  body: string;
  header: string;
  footer: string;
  buttons: string[];
};
type Summary = {
  marketingSubscribers: number;
  registeredCustomers: number;
  messageCounts: Record<string, number>;
  connection: {
    ready: boolean;
    checks: { label: string; configured: boolean }[];
    message: string;
    template: Template | null;
  };
};
type Customer = { id: string; name: string; phone: string };
type Campaign = {
  id: string;
  title: string;
  offer: string;
  audience: string;
  templateName: string;
  templateBody: string;
  templateLanguage: string;
  recipientCount: number;
  createdAt: string;
  counts: Record<string, number>;
};
type Message = {
  id: number;
  customerName: string;
  phone: string;
  status: string;
  errorCode: string | null;
  updatedAt: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/whatsapp${path}`, init);
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The messaging service could not be reached. Please try again.",
    );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your admin session has expired. Sign in again."
        : data.error || "Could not complete this request.",
    );
  return data;
}
const card = "rounded-2xl border border-warm-border bg-white p-5 sm:p-6";
const field =
  "w-full rounded-xl border border-warm-border bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/30 disabled:opacity-50";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-warm-border px-4 py-2 text-sm hover:bg-parchment disabled:opacity-40";
const labels: Record<string, string> = {
  accepted: "Accepted by Meta",
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  cancelled: "Cancelled",
  uncertain: "Needs review",
};
function Status({ status, count }: { status: string; count?: number }) {
  const color = ["read", "delivered"].includes(status)
    ? "bg-green-50 text-green-800"
    : ["failed", "uncertain"].includes(status)
      ? "bg-red-50 text-red-700"
      : "bg-stone-100 text-stone-600";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${color}`}>
      {labels[status] || status}
      {count !== undefined ? ` · ${count}` : ""}
    </span>
  );
}
function Preview({
  template,
  offer,
}: {
  template: Template | null;
  offer: string;
}) {
  return (
    <div className="rounded-2xl bg-[#e7efe8] p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-forest">
        <MessageCircle className="h-4 w-4" /> DollDime on WhatsApp
      </div>
      <div className="rounded-xl rounded-tl-none bg-white p-4 shadow-sm text-sm leading-relaxed break-words">
        {template?.header && (
          <p className="mb-2 font-semibold">{template.header}</p>
        )}
        <p className="whitespace-pre-wrap">
          {template
            ? template.body.replace(
                "{{1}}",
                () => offer.trim() || "[Your offer appears here]",
              )
            : offer.trim() || "Write a short offer to see it here."}
        </p>
        {template?.footer && (
          <p className="mt-3 text-xs text-warm-secondary">{template.footer}</p>
        )}
        {template?.buttons.map((text) => (
          <p key={text} className="mt-3 border-t pt-2 text-center text-forest">
            {text}
          </p>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-stone-600">
        {template
          ? "Preview uses your template from Meta. WhatsApp may format text differently."
          : "Offer preview only. The full message appears after an approved Meta template is connected."}
      </p>
    </div>
  );
}

export function WhatsApp() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer[]>([]);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [review, setReview] = useState(false);
  const [setup, setSetup] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const summary = useQuery({
    queryKey: ["whatsapp-summary"],
    queryFn: () => api<Summary>("/summary"),
    refetchInterval: 15000,
  });
  const history = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: () => api<Campaign[]>("/campaigns"),
    refetchInterval: 10000,
  });
  const customers = useQuery({
    queryKey: ["whatsapp-audience", search],
    queryFn: () =>
      api<Customer[]>(`/audience?search=${encodeURIComponent(search)}`),
    enabled: audience === "selected",
  });
  const messages = useQuery({
    queryKey: ["whatsapp-messages", expanded, offset],
    queryFn: () =>
      api<Message[]>(`/campaigns/${expanded}/messages?offset=${offset}`),
    enabled: Boolean(expanded),
    refetchInterval: 10000,
  });
  const data = summary.data;
  const recipients =
    audience === "all" ? data?.marketingSubscribers || 0 : selected.length;
  const ready = Boolean(data?.connection.ready);
  const valid =
    title.trim().length >= 3 &&
    offer.trim().length >= 5 &&
    !/[\r\n\t]/.test(offer) &&
    !/ {5}/.test(offer) &&
    recipients > 0 &&
    recipients <= 5000;
  const refresh = async () => {
    setRefreshing(true);
    try {
      qc.setQueryData(
        ["whatsapp-summary"],
        await api<Summary>("/summary?refresh=true"),
      );
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    } finally {
      setRefreshing(false);
    }
  };
  const send = async () => {
    setBusy(true);
    setFeedback(null);
    const body = {
      title: title.trim(),
      offer: offer.trim(),
      audience,
      recipientIds:
        audience === "selected"
          ? selected.map((user) => user.id).sort()
          : [],
    };
    const signature = JSON.stringify(body);
    if (submission.current?.signature !== signature)
      submission.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await api<{ queued: number; campaignId: string }>(
        "/campaigns",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, campaignId: submission.current!.id }),
        },
      );
      setFeedback({
        error: false,
        text: `${result.queued} WhatsApp messages queued. Follow delivery below; queued does not mean delivered.`,
      });
      submission.current = null;
      setTitle("");
      setOffer("");
      setSelected([]);
      setReview(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        qc.invalidateQueries({ queryKey: ["whatsapp-summary"] }),
      ]);
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
      setReview(false);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    if (
      !window.confirm(
        "Stop messages that are still queued? Messages already being sent cannot be recalled.",
      )
    )
      return;
    setCancelling(id);
    try {
      const result = await api<{ cancelled: number }>(
        `/campaigns/${id}/cancel`,
        { method: "POST" },
      );
      setFeedback({
        error: false,
        text: `${result.cancelled} queued messages cancelled.`,
      });
      await qc.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      await qc.invalidateQueries({ queryKey: ["whatsapp-messages"] });
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    } finally {
      setCancelling(null);
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-widest text-forest font-semibold">
            Customer messaging
          </p>
          <h1 className="text-3xl font-semibold text-ink">
            WhatsApp promotions
          </h1>
          <p className="mt-2 text-sm text-warm-secondary">
            Share offers with customers and follow each campaign’s delivery.
          </p>
        </div>
        <button className={secondary} disabled={refreshing} onClick={refresh}>
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />{" "}
          Refresh status
        </button>
      </div>
      {summary.error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {summary.error.message}
        </p>
      )}
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={`rounded-xl p-4 text-sm ${feedback.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}
        >
          {feedback.text}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <p className="text-xs uppercase tracking-wide text-warm-secondary">
            Active customers
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {data?.registeredCustomers ?? "—"}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs uppercase tracking-wide text-warm-secondary">
            Subscribed to offers
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {data?.marketingSubscribers ?? "—"}
          </p>
        </div>
        <div className={card}>
          <p className="text-xs uppercase tracking-wide text-warm-secondary">
            Meta connection
          </p>
          <p
            className={`mt-3 flex items-center gap-2 font-semibold ${ready ? "text-forest" : "text-amber-700"}`}
          >
            {ready ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            {data ? (ready ? "Ready to send" : "Setup required") : "Checking…"}
          </p>
          <button
            className="mt-2 text-sm underline underline-offset-4"
            onClick={() => setSetup(!setup)}
          >
            {setup ? "Hide setup" : "View connection setup"}
          </button>
        </div>
      </div>
      {data && !ready && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>{data.connection.message}</p>
          <button
            className="font-semibold underline"
            onClick={() => setSetup(true)}
          >
            Open setup checklist
          </button>
        </div>
      )}
      {setup && (
        <section className={card}>
          <h2 className="font-semibold">Connect official Meta WhatsApp</h2>
          <p className="mt-2 text-sm text-warm-secondary">
            These credentials are stored securely on the server. The admin
            portal never displays access tokens.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data?.connection.checks.map((check) => (
              <div
                key={check.label}
                className="flex items-center gap-2 text-sm"
              >
                {check.configured ? (
                  <CheckCircle2 className="h-4 w-4 text-forest" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                )}
                <span>
                  {check.label} — {check.configured ? "configured" : "needed"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm">{data?.connection.message}</p>
          <p className="mt-3 text-sm text-warm-secondary">
            Meta must approve a marketing template containing one offer field,{" "}
            {"{{1}}"}. The webhook records delivery updates and STOP replies.
            After configuring Meta, refresh this status.
          </p>
          {data?.connection.template && (
            <p className="mt-3 rounded-lg bg-parchment p-3 text-xs">
              Template: {data.connection.template.name} ·{" "}
              {data.connection.template.language} ·{" "}
              {data.connection.template.status} ·{" "}
              {data.connection.template.category}
            </p>
          )}
        </section>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <form
          className={`${card} space-y-5`}
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && ready) setReview(true);
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">Create a promotion</h2>
            <p className="mt-1 text-sm text-warm-secondary">
              Customers choose Offers and promotions in Profile → Notifications.
            </p>
          </div>
          <label className="block text-sm font-medium">
            Campaign name
            <input
              className={`${field} mt-2`}
              maxLength={80}
              minLength={3}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="For example: Dussehra weekend offer"
              required
              disabled={busy}
            />
            <span className="mt-1 block text-xs font-normal text-warm-secondary">
              For your team’s records; customers receive the message below.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Offer message
            <textarea
              className={`${field} mt-2 resize-y`}
              rows={3}
              maxLength={200}
              value={offer}
              onChange={(event) => setOffer(event.target.value)}
              placeholder="Enjoy 10% off our festive doll collection until Sunday."
              required
              disabled={busy}
            />
            <span className="mt-1 block text-xs font-normal text-warm-secondary">
              {offer.length}/200 characters · one short line inside your
              approved template.
            </span>
          </label>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 text-sm font-medium">
              Who should receive this?
            </legend>
            <label className="flex items-start gap-3 rounded-xl border border-warm-border p-3 cursor-pointer">
              <input
                type="radio"
                name="audience"
                checked={audience === "all"}
                onChange={() => setAudience("all")}
                className="mt-1 accent-green-700"
              />
              <span className="text-sm">
                All subscribed customers
                <span className="mt-1 block text-xs text-warm-secondary">
                  {data?.marketingSubscribers ?? "—"} active customers who
                  agreed to receive offers.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-warm-border p-3 cursor-pointer">
              <input
                type="radio"
                name="audience"
                checked={audience === "selected"}
                onChange={() => setAudience("selected")}
                className="mt-1 accent-green-700"
              />
              <span className="text-sm">
                Selected subscribers
                <span className="mt-1 block text-xs text-warm-secondary">
                  Use a subscribed team account for your first test, or select a
                  smaller audience.
                </span>
              </span>
            </label>
            {audience === "selected" && (
              <div className="space-y-3">
                <input
                  className={field}
                  placeholder="Find subscriber by name or phone"
                  aria-label="Find subscriber"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {!!selected.length && (
                  <div className="flex flex-wrap gap-2">
                    {selected.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="rounded-full bg-green-50 px-3 py-1 text-xs text-forest"
                        onClick={() =>
                          setSelected(
                            selected.filter((item) => item.id !== user.id),
                          )
                        }
                      >
                        {user.name} ×
                      </button>
                    ))}
                  </div>
                )}
                <div className="max-h-44 overflow-y-auto rounded-xl border border-warm-border">
                  {customers.isPending ? (
                    <p className="p-3 text-sm">Loading subscribers…</p>
                  ) : customers.error ? (
                    <p role="alert" className="p-3 text-sm text-red-600">
                      {customers.error.message}
                    </p>
                  ) : customers.data?.length ? (
                    customers.data.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-3 border-b last:border-0 p-3 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.some((item) => item.id === user.id)}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...selected, user]
                                : selected.filter(
                                    (item) => item.id !== user.id,
                                  ),
                            )
                          }
                        />
                        <span>
                          {user.name}
                          <span className="ml-2 text-xs text-warm-secondary">
                            {user.phone}
                          </span>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="p-3 text-sm text-warm-secondary">
                      No subscribers found.
                    </p>
                  )}
                </div>
                <p className="text-xs text-warm-secondary">
                  Showing up to 50 results. Search to find other subscribers.
                </p>
              </div>
            )}
          </fieldset>
          {data?.marketingSubscribers === 0 && (
            <p className="rounded-lg bg-parchment p-3 text-sm">
              No customers have subscribed yet. In the customer app, open
              Profile → Notifications, enable Offers and promotions, and save.
            </p>
          )}
          <p className="text-xs leading-relaxed text-warm-secondary">
            Promotions use Meta’s approved marketing template and may incur
            WhatsApp charges. Consent is checked again before each message is
            sent. Maximum 5,000 recipients per campaign.
          </p>
          <button
            type="submit"
            className={`${primary} w-full`}
            disabled={busy || !ready || !valid}
          >
            <Send className="h-4 w-4" /> Review promotion · {recipients}{" "}
            {recipients === 1 ? "recipient" : "recipients"}
          </button>
        </form>
        <aside className="space-y-4">
          <Preview template={data?.connection.template || null} offer={offer} />
          <div className="px-1 text-sm text-warm-secondary">
            <p className="font-medium text-ink">A customer’s choice matters</p>
            <p className="mt-2 leading-relaxed">
              Only customers who subscribe receive promotions. They can turn
              offers off in the app or reply STOP on WhatsApp.
            </p>
          </div>
        </aside>
      </div>
      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold">Campaign history</h2>
          <p className="mt-1 text-sm text-warm-secondary">
            Latest 50 campaigns. Status refreshes automatically. Accepted by
            Meta means delivery is still pending.
          </p>
        </div>
        {history.isPending ? (
          <p className="py-6 text-sm text-warm-secondary">Loading campaigns…</p>
        ) : history.error ? (
          <p role="alert" className="text-sm text-red-600">
            {history.error.message}
          </p>
        ) : !history.data?.length ? (
          <div className="rounded-xl bg-parchment p-8 text-center">
            <Users className="mx-auto mb-3 h-7 w-7 text-warm-secondary" />
            <p className="font-medium">Your first promotion starts here</p>
            <p className="mt-1 text-sm text-warm-secondary">
              Create a message above. Its delivery results will appear here.
            </p>
          </div>
        ) : (
          history.data.map((campaign) => (
            <article
              key={campaign.id}
              className="rounded-xl border border-warm-border p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{campaign.title}</h3>
                  <p className="mt-1 text-xs text-warm-secondary">
                    {new Date(campaign.createdAt).toLocaleString()} ·{" "}
                    {campaign.recipientCount} recipients ·{" "}
                    {campaign.audience === "all"
                      ? "All subscribers"
                      : "Selected subscribers"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!!campaign.counts.queued && (
                    <button
                      className={secondary}
                      disabled={cancelling === campaign.id}
                      onClick={() => cancel(campaign.id)}
                    >
                      {cancelling === campaign.id
                        ? "Stopping…"
                        : "Stop queued messages"}
                    </button>
                  )}
                  <button
                    className={secondary}
                    onClick={() => {
                      setExpanded(
                        expanded === campaign.id ? null : campaign.id,
                      );
                      setOffset(0);
                    }}
                  >
                    Delivery details <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">
                {campaign.templateBody.replace("{{1}}", () => campaign.offer)}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(campaign.counts).map(([status, count]) => (
                  <Status key={status} status={status} count={count} />
                ))}
              </div>
              {expanded === campaign.id && (
                <div className="border-t pt-3">
                  {messages.isPending ? (
                    <p className="text-sm">Loading delivery results…</p>
                  ) : messages.error ? (
                    <p role="alert" className="text-sm text-red-600">
                      {messages.error.message}
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-xs text-warm-secondary">
                              <th className="py-2 font-medium">Customer</th>
                              <th className="py-2 font-medium">Delivery</th>
                              <th className="py-2 font-medium">Updated</th>
                            </tr>
                          </thead>
                          <tbody>
                            {messages.data?.map((message) => (
                              <tr key={message.id} className="border-t">
                                <td className="py-3 pr-3">
                                  {message.customerName}
                                  <span className="block text-xs text-warm-secondary">
                                    {message.phone}
                                  </span>
                                </td>
                                <td className="py-3 pr-3">
                                  <Status status={message.status} />
                                  {message.errorCode && (
                                    <span className="mt-1 block text-xs text-red-600">
                                      Meta code: {message.errorCode}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 text-xs text-warm-secondary">
                                  {new Date(message.updatedAt).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span>
                          {offset + 1}–
                          {Math.min(offset + 50, campaign.recipientCount)} of{" "}
                          {campaign.recipientCount}
                        </span>
                        <div className="flex gap-2">
                          <button
                            className={secondary}
                            disabled={!offset}
                            onClick={() => setOffset(Math.max(0, offset - 50))}
                          >
                            Previous
                          </button>
                          <button
                            className={secondary}
                            disabled={offset + 50 >= campaign.recipientCount}
                            onClick={() => setOffset(offset + 50)}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <p className="mt-3 text-xs text-warm-secondary">
                    Cancelled messages were stopped or the customer withdrew
                    consent. “Needs review” means Meta’s response was lost;
                    these messages are not resent automatically.
                  </p>
                </div>
              )}
            </article>
          ))
        )}
      </section>
      <Dialog
        open={review}
        onOpenChange={(open) => {
          if (!busy) setReview(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send this WhatsApp promotion?</DialogTitle>
            <DialogDescription>
              Review the message and audience. Meta messaging charges may apply.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            <strong>{title}</strong> · {recipients} subscribed{" "}
            {recipients === 1 ? "customer" : "customers"}
          </p>
          <Preview template={data?.connection.template || null} offer={offer} />
          <DialogFooter>
            <button
              className={secondary}
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Keep editing
            </button>
            <button
              className={primary}
              disabled={busy || !ready || !valid}
              onClick={send}
            >
              {busy ? "Queueing…" : `Queue ${recipients} messages`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
