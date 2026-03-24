import { sendWhatsApp } from "./twilio";

function fmt(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// ── Order confirmation ────────────────────────────────────────────────────────
export async function notifyOrderConfirmed(opts: {
  phone: string;
  name: string;
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

  return sendWhatsApp(opts.phone, msg);
}

// ── Chit EMI payment confirmation ────────────────────────────────────────────
export async function notifyChitEmiPaid(opts: {
  phone: string;
  name: string;
  planName: string;
  emiAmount: number;
  totalPaid: number;
  totalAmount: number;
  isCompleted: boolean;
  nextPaymentDate?: Date | null;
}) {
  const progress = Math.round((opts.totalPaid / opts.totalAmount) * 100);

  const lines = [
    `✅ *EMI Payment Received — DollDime*`,
    ``,
    `Hi ${opts.name}, your EMI for *${opts.planName}* has been recorded.`,
    ``,
    `*EMI Paid:* ${fmt(opts.emiAmount)}`,
    `*Total Paid:* ${fmt(opts.totalPaid)} / ${fmt(opts.totalAmount)} (${progress}%)`,
  ];

  if (opts.isCompleted) {
    lines.push(``, `🎊 *Congratulations!* You've completed your chit plan. Your savings journey is complete!`);
  } else if (opts.nextPaymentDate) {
    lines.push(``, `📅 *Next EMI Due:* ${fmtDate(opts.nextPaymentDate)}`);
  }

  lines.push(``, `Thank you for saving with DollDime! 💰`);

  return sendWhatsApp(opts.phone, lines.join("\n"));
}

// ── Wallet top-up confirmation ─────────────────────────────────────────────
export async function notifyWalletTopUp(opts: {
  phone: string;
  name: string;
  credited: number;
  newBalance: number;
}) {
  const msg = [
    `💳 *Wallet Topped Up — DollDime*`,
    ``,
    `Hi ${opts.name}, ${fmt(opts.credited)} has been added to your DollDime wallet.`,
    ``,
    `*New Balance:* ${fmt(opts.newBalance)}`,
    ``,
    `Use your wallet to shop or pay chit EMIs instantly. 🛍️`,
  ].join("\n");

  return sendWhatsApp(opts.phone, msg);
}

// ── Chit due reminder ─────────────────────────────────────────────────────────
export async function notifyChitDueReminder(opts: {
  phone: string;
  name: string;
  planName: string;
  emiAmount: number;
  dueDate: Date;
  daysLeft: number;
}) {
  const urgency = opts.daysLeft <= 0
    ? `⚠️ *OVERDUE — DollDime Chit Reminder*`
    : opts.daysLeft === 1
    ? `🔔 *EMI Due Tomorrow — DollDime*`
    : `📅 *Upcoming EMI Reminder — DollDime*`;

  const dueLabel = opts.daysLeft <= 0
    ? `Your EMI was due on ${fmtDate(opts.dueDate)} and has not been paid yet.`
    : opts.daysLeft === 1
    ? `Your EMI is due tomorrow, ${fmtDate(opts.dueDate)}.`
    : `Your EMI is due in ${opts.daysLeft} days on ${fmtDate(opts.dueDate)}.`;

  const msg = [
    urgency,
    ``,
    `Hi ${opts.name}, ${dueLabel}`,
    ``,
    `*Plan:* ${opts.planName}`,
    `*EMI Amount:* ${fmt(opts.emiAmount)}`,
    ``,
    `Open the DollDime app to pay your EMI and keep your chit plan on track. 💪`,
  ].join("\n");

  return sendWhatsApp(opts.phone, msg);
}
