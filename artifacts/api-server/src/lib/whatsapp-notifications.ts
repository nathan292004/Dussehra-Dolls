import { sendWhatsAppLogged } from "./notify";

function fmt(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

interface Who {
  phone: string;
  name: string;
  userId?: string;
}

// ── Order confirmation ────────────────────────────────────────────────────────
export async function notifyOrderConfirmed(opts: Who & {
  orderId: number;
  total: number;
  items: { productName: string; quantity: number; price: number }[];
}) {
  const itemLines = opts.items
    .map(i => `  • ${i.productName} × ${i.quantity} — ${fmt(i.price * i.quantity)}`)
    .join("\n");

  const msg = [
    `🎉 *Order Confirmed! — DollDime*`,
    ``,
    `Hi ${opts.name}, your order has been placed successfully.`,
    ``,
    `*Order #${opts.orderId}*`,
    itemLines,
    ``,
    `*Total Paid:* ${fmt(opts.total)}`,
    ``,
    `Your dolls will be delivered soon. Thank you for shopping with DollDime! 🪆`,
  ].join("\n");

  return sendWhatsAppLogged(opts.phone, msg, {
    userId: opts.userId, kind: "order_confirmed", relatedType: "order", relatedId: opts.orderId,
  });
}

// ── Wallet top-up confirmation ───────────────────────────────────────────────
export async function notifyWalletTopUp(opts: Who & { credited: number; newBalance: number }) {
  const msg = [
    `💳 *Wallet Topped Up — DollDime*`,
    ``,
    `Hi ${opts.name}, ${fmt(opts.credited)} has been added to your DollDime wallet.`,
    ``,
    `*New Balance:* ${fmt(opts.newBalance)}`,
    ``,
    `Use your wallet to shop for dolls. 🛍️`,
  ].join("\n");

  return sendWhatsAppLogged(opts.phone, msg, { userId: opts.userId, kind: "wallet_topup" });
}

// ── Chit plan review ─────────────────────────────────────────────────────────
export async function notifyChitPlanSubmitted(opts: Who & { chitPlanId: number; planName: string }) {
  const msg = [
    `📝 *Chit Plan Received — DollDime*`,
    ``,
    `Hi ${opts.name}, we have received your chit plan *${opts.planName}* and it is now under review.`,
    ``,
    `We will message you as soon as it is approved. You can start paying once it is approved.`,
  ].join("\n");
  return sendWhatsAppLogged(opts.phone, msg, {
    userId: opts.userId, kind: "chit_plan_submitted", relatedType: "chit_plan", relatedId: opts.chitPlanId,
  });
}

export async function notifyChitPlanApproved(opts: Who & {
  chitPlanId: number;
  planName: string;
  amountDueNow: number;
}) {
  const msg = [
    `✅ *Chit Plan Approved — DollDime*`,
    ``,
    `Hi ${opts.name}, your chit plan *${opts.planName}* has been approved. 🎉`,
    ``,
    `*Amount to pay now:* ${fmt(opts.amountDueNow)}`,
    ``,
    `Open the DollDime app → Chit Plans → My Chits to make your payment.`,
  ].join("\n");
  return sendWhatsAppLogged(opts.phone, msg, {
    userId: opts.userId, kind: "chit_plan_approved", relatedType: "chit_plan", relatedId: opts.chitPlanId,
  });
}

export async function notifyChitPlanRejected(opts: Who & {
  chitPlanId: number;
  planName: string;
  reason?: string | null;
}) {
  const lines = [
    `⚠️ *Chit Plan Not Approved — DollDime*`,
    ``,
    `Hi ${opts.name}, we are sorry, your chit plan *${opts.planName}* could not be approved.`,
  ];
  if (opts.reason) lines.push(``, `*Reason:* ${opts.reason}`);
  lines.push(``, `You are welcome to submit a new plan from the DollDime app, or contact us for help.`);
  return sendWhatsAppLogged(opts.phone, lines.join("\n"), {
    userId: opts.userId, kind: "chit_plan_rejected", relatedType: "chit_plan", relatedId: opts.chitPlanId,
  });
}

// ── Chit payment confirmation ────────────────────────────────────────────────
export async function notifyChitEmiPaid(opts: Who & {
  chitPlanId: number;
  planName: string;
  emiAmount: number;
  totalPaid: number;
  totalAmount: number;
  isCompleted: boolean;
  nextPaymentDate?: Date | null;
  bonusPoints?: number;
}) {
  const progress = Math.round((opts.totalPaid / opts.totalAmount) * 100);

  const lines = [
    `✅ *Chit Payment Received — DollDime*`,
    ``,
    `Hi ${opts.name}, your payment for *${opts.planName}* has been recorded.`,
    ``,
    `*Paid now:* ${fmt(opts.emiAmount)}`,
    `*Total Paid:* ${fmt(opts.totalPaid)} / ${fmt(opts.totalAmount)} (${progress}%)`,
  ];

  if (opts.isCompleted) {
    lines.push(``, `🎊 *Congratulations!* You've completed your chit plan. Your savings of ${fmt(opts.totalPaid)}${opts.bonusPoints ? ` plus ${opts.bonusPoints.toLocaleString("en-IN")} bonus points` : ""} are now unlocked in your DollDime wallet.`);
  } else if (opts.nextPaymentDate) {
    lines.push(``, `📅 *Next payment opens:* ${fmtDate(opts.nextPaymentDate)}`);
  }

  lines.push(``, `Thank you for saving with DollDime! 💰`);

  return sendWhatsAppLogged(opts.phone, lines.join("\n"), {
    userId: opts.userId,
    kind: opts.isCompleted ? "chit_completed" : "chit_payment_received",
    relatedType: "chit_plan",
    relatedId: opts.chitPlanId,
  });
}

/** Sent when a payment arrives but the amount due is still not fully covered. */
export async function notifyChitPartialPayment(opts: Who & {
  chitPlanId: number;
  planName: string;
  received: number;
  stillPending: number;
  totalPaid: number;
  totalAmount: number;
}) {
  const msg = [
    `⚠️ *Payment Not Completed in Full — DollDime*`,
    ``,
    `Hi ${opts.name}, we received ${fmt(opts.received)} for *${opts.planName}*, but it does not cover the full amount due.`,
    ``,
    `*Received now:* ${fmt(opts.received)}`,
    `*Still pending:* ${fmt(opts.stillPending)}`,
    `*Total paid so far:* ${fmt(opts.totalPaid)} / ${fmt(opts.totalAmount)}`,
    ``,
    `Please pay the remaining ${fmt(opts.stillPending)} in the DollDime app (Chit Plans → My Chits). Your plan is not up to date until it is paid.`,
  ].join("\n");
  return sendWhatsAppLogged(opts.phone, msg, {
    userId: opts.userId, kind: "chit_payment_partial", relatedType: "chit_plan", relatedId: opts.chitPlanId,
  });
}

// ── Monthly chit reminders (sent on the 4th and the 10th) ────────────────────
interface ChitPendingInfo extends Who {
  chitPlanId: number;
  planName: string;
  monthName: string;
  monthlyAmount: number;
  totalPending: number;
}

function pendingLines(o: ChitPendingInfo) {
  const lines = [`*Plan:* ${o.planName}`, `*This month (${o.monthName}):* ${fmt(o.monthlyAmount)}`];
  if (o.totalPending > o.monthlyAmount) {
    lines.push(`*Total pending (includes earlier months):* ${fmt(o.totalPending)}`);
  }
  return lines;
}

/** 4th of the month — sent to everyone who still has an amount pending. */
export async function notifyChitMonthlyDue(o: ChitPendingInfo) {
  const msg = [
    `📅 *Chit Payment Due — DollDime*`,
    ``,
    `Hi ${o.name}, your ${o.monthName} chit payment is due.`,
    ``,
    ...pendingLines(o),
    ``,
    `Open the DollDime app → Chit Plans → My Chits to pay.`,
    `If you have already paid, please ignore this message. 🙏`,
  ].join("\n");
  return sendWhatsAppLogged(o.phone, msg, {
    userId: o.userId, kind: "chit_reminder_day4", relatedType: "chit_plan", relatedId: o.chitPlanId,
  });
}

/** 10th of the month — second reminder, only for customers who still haven't paid. */
export async function notifyChitSecondReminder(o: ChitPendingInfo) {
  const msg = [
    `⚠️ *Reminder: Chit Payment Pending — DollDime*`,
    ``,
    `Hi ${o.name}, we have not received your ${o.monthName} chit payment yet.`,
    ``,
    ...pendingLines(o),
    ``,
    `Please pay today in the DollDime app (Chit Plans → My Chits) to keep your plan on track and earn your full bonus points. 💪`,
  ].join("\n");
  return sendWhatsAppLogged(o.phone, msg, {
    userId: o.userId, kind: "chit_reminder_day10", relatedType: "chit_plan", relatedId: o.chitPlanId,
  });
}
