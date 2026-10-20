import type Razorpay from "razorpay";
import { db } from "@workspace/db";
import {
  ordersTable,
  cartItemsTable,
  productsTable,
  transactionsTable,
  walletsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { fromPaise, paiseToDecimal, toPaise } from "./money";
import { notifyOrderConfirmed } from "./whatsapp-notifications";

export interface StockShortage {
  productId: number;
  name: string;
  requested: number;
  available: number;
}

export class OrderPaymentError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
    public shortages?: StockShortage[],
  ) {
    super(message);
  }
}

/** Minutes an unpaid checkout may hold its stock (and any wallet money) before it is released. */
export const CHECKOUT_HOLD_MINUTES = 30;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderItems = (typeof ordersTable.$inferSelect)["items"];

/** Lines merged per product and sorted by product id: always lock products in the same order (no deadlocks). */
function normalise(items: OrderItems) {
  const byProduct = new Map<number, { productId: number; productName: string; quantity: number }>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new OrderPaymentError("Invalid order quantity", 400);
    }
    const existing = byProduct.get(item.productId);
    if (existing) existing.quantity += item.quantity;
    else byProduct.set(item.productId, { productId: item.productId, productName: item.productName, quantity: item.quantity });
  }
  return [...byProduct.values()].sort((a, b) => a.productId - b.productId);
}

export function shortageMessage(shortages: StockShortage[]) {
  const first = shortages[0];
  if (shortages.length === 1) {
    return first.available <= 0
      ? `${first.name} ran out of stock`
      : `Only ${first.available} of ${first.name} left (you asked for ${first.requested})`;
  }
  return `${shortages.map((s) => s.name).join(", ")} are no longer available in the quantity you chose`;
}

/**
 * Locks the product rows and checks every line is available (stock minus what other unpaid
 * checkouts are holding). Reports ALL short items, not just the first. Rows stay locked until
 * the transaction ends, so nobody else can take the stock in between.
 */
async function lockAndCheckAvailability(tx: Tx, lines: ReturnType<typeof normalise>) {
  const rows = await tx
    .select({
      id: productsTable.id,
      name: productsTable.name,
      stock: productsTable.stock,
      reserved: productsTable.reservedStock,
      isListed: productsTable.isListed,
    })
    .from(productsTable)
    .where(inArray(productsTable.id, lines.map((l) => l.productId)))
    .orderBy(asc(productsTable.id))
    .for("update");
  const byId = new Map(rows.map((r) => [r.id, r]));

  const shortages: StockShortage[] = [];
  for (const line of lines) {
    const row = byId.get(line.productId);
    const available = row && row.isListed ? Math.max(row.stock - row.reserved, 0) : 0;
    if (available < line.quantity) {
      shortages.push({ productId: line.productId, name: row?.name ?? line.productName, requested: line.quantity, available });
    }
  }
  if (shortages.length) throw new OrderPaymentError(shortageMessage(shortages), 409, "OUT_OF_STOCK", shortages);
}

/**
 * Freezes stock for a checkout that is about to go to payment. This is the availability
 * check: it fails with OUT_OF_STOCK if anything is short, and nothing is held in that case.
 */
export async function reserveStock(tx: Tx, items: OrderItems) {
  const lines = normalise(items);
  await lockAndCheckAvailability(tx, lines);
  for (const line of lines) {
    await tx
      .update(productsTable)
      .set({ reservedStock: sql`${productsTable.reservedStock} + ${line.quantity}`, updatedAt: new Date() })
      .where(eq(productsTable.id, line.productId));
  }
}

/** Gives frozen stock back (checkout abandoned, expired or cancelled). */
export async function releaseStock(tx: Tx, items: OrderItems) {
  for (const line of normalise(items)) {
    await tx
      .update(productsTable)
      .set({ reservedStock: sql`GREATEST(${productsTable.reservedStock} - ${line.quantity}, 0)`, updatedAt: new Date() })
      .where(eq(productsTable.id, line.productId));
  }
}

/** The customer paid: the frozen units are now sold. */
export async function commitReservedStock(tx: Tx, items: OrderItems) {
  for (const line of normalise(items)) {
    await tx
      .update(productsTable)
      .set({
        stock: sql`${productsTable.stock} - ${line.quantity}`,
        reservedStock: sql`${productsTable.reservedStock} - ${line.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, line.productId));
  }
}

/** Sells stock straight away (wallet-only orders skip the freeze step). Fails if anything is short. */
export async function sellStock(tx: Tx, items: OrderItems) {
  const lines = normalise(items);
  await lockAndCheckAvailability(tx, lines);
  for (const line of lines) {
    await tx
      .update(productsTable)
      .set({ stock: sql`${productsTable.stock} - ${line.quantity}`, updatedAt: new Date() })
      .where(eq(productsTable.id, line.productId));
  }
}

/** Adds money back to the spendable wallet balance (creates the wallet if needed). */
async function creditWallet(tx: Tx, userId: string, paise: number) {
  await tx
    .insert(walletsTable)
    .values({ userId, balance: paiseToDecimal(paise) })
    .onConflictDoUpdate({
      target: walletsTable.userId,
      set: { balance: sql`${walletsTable.balance} + ${paiseToDecimal(paise)}::numeric`, updatedAt: new Date() },
    });
}

/**
 * Pays the order's wallet part. Fails if the balance is too low.
 * Only the spendable balance is used, never money locked in a chit plan.
 */
export async function debitWalletForOrder(tx: Tx, userId: string, paise: number, description: string) {
  const [updated] = await tx
    .update(walletsTable)
    .set({ balance: sql`${walletsTable.balance} - ${paiseToDecimal(paise)}::numeric`, updatedAt: new Date() })
    .where(and(eq(walletsTable.userId, userId), sql`${walletsTable.balance} >= ${paiseToDecimal(paise)}::numeric`))
    .returning({ id: walletsTable.id });
  if (!updated) {
    throw new OrderPaymentError("Your wallet balance changed. Please try again.", 409, "WALLET_CHANGED");
  }
  await tx.insert(transactionsTable).values({
    userId,
    type: "debit",
    amount: paiseToDecimal(paise),
    description,
  });
}

/**
 * Marks a pending order as paid. Called after the online part has been verified with Razorpay,
 * from both the app's verify call and the Razorpay webhook. Safe to call twice.
 */
export async function confirmPaidOrder(opts: {
  orderId: number;
  userId: string;
  razorpayPaymentId: string;
  onlinePaise: number;
}) {
  const { order, applied } = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${opts.razorpayPaymentId}))`);
    const [current] = await tx
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, opts.orderId), eq(ordersTable.userId, opts.userId)))
      .for("update");
    if (!current) throw new OrderPaymentError("Order not found", 404);
    if (current.paymentStatus === "paid") return { order: current, applied: false };
    if (current.status !== "pending") {
      // The checkout expired and its stock and wallet money were already given back.
      throw new OrderPaymentError(
        "This checkout expired before the payment completed. Your payment will be refunded.",
        409,
        "ORDER_EXPIRED",
      );
    }

    if (current.stockReserved) await commitReservedStock(tx, current.items);
    else await sellStock(tx, current.items);

    const [confirmed] = await tx
      .update(ordersTable)
      .set({ status: "confirmed", paymentStatus: "paid", stockReserved: false })
      .where(eq(ordersTable.id, current.id))
      .returning();
    await tx.delete(cartItemsTable).where(eq(cartItemsTable.userId, opts.userId));
    await tx.insert(transactionsTable).values({
      userId: opts.userId,
      type: "debit",
      amount: paiseToDecimal(opts.onlinePaise),
      razorpayPaymentId: opts.razorpayPaymentId,
      description: `Order #${confirmed.id} (Razorpay ${opts.razorpayPaymentId})`,
    });
    return { order: confirmed, applied: true };
  });

  if (applied) void notifyOrder(order);
  return { order, applied };
}

export async function notifyOrder(order: typeof ordersTable.$inferSelect) {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, order.userId)).limit(1);
    if (!user?.phone) return;
    await notifyOrderConfirmed({
      phone: user.phone,
      name: [user.fname, user.lname].filter(Boolean).join(" ") || "Customer",
      userId: user.userId,
      orderId: order.id,
      total: fromPaise(toPaise(order.total)),
      items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, price: i.price })),
    });
  } catch (e) {
    console.error("[WhatsApp] Order notify failed:", e);
  }
}

/**
 * Cancels an unpaid checkout: unfreezes its stock and gives back any wallet money held for it.
 * Does nothing (returns false) if the order is no longer pending, so it is safe to repeat.
 */
export async function releasePendingOrder(orderId: number, userId?: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order || (userId !== undefined && order.userId !== userId)) return false;
    if (order.status !== "pending" || order.paymentStatus !== "pending") return false;

    const heldPaise = toPaise(order.walletAmount);
    await tx
      .update(ordersTable)
      .set({ status: "cancelled", paymentStatus: "cancelled", stockReserved: false })
      .where(eq(ordersTable.id, order.id));
    if (heldPaise > 0) {
      await creditWallet(tx, order.userId, heldPaise);
      await tx.insert(transactionsTable).values({
        userId: order.userId,
        type: "credit",
        amount: paiseToDecimal(heldPaise),
        description: `Refund – wallet money released for unpaid Order #${order.id}`,
      });
    }
    if (order.stockReserved) await releaseStock(tx, order.items);
    return true;
  });
}

export type ShopOrderOutcome =
  | { kind: "confirmed"; order: typeof ordersTable.$inferSelect; applied: boolean }
  | { kind: "refunded"; reason: "expired" | "out_of_stock"; message: string };

/**
 * Settles a verified online payment for an order. If the order can no longer be fulfilled
 * (the checkout expired, or stock was taken away meanwhile) the payment is refunded and any
 * wallet money held for the order is released, so the customer is never left out of pocket.
 */
export async function finalizeShopOrderPayment(
  rp: Razorpay,
  opts: { orderId: number; userId: string; razorpayPaymentId: string; onlinePaise: number },
): Promise<ShopOrderOutcome> {
  try {
    const r = await confirmPaidOrder(opts);
    return { kind: "confirmed", order: r.order, applied: r.applied };
  } catch (err) {
    if (!(err instanceof OrderPaymentError)) throw err;
    if (err.code === "ORDER_EXPIRED") {
      await refundRazorpayPayment(rp, opts.razorpayPaymentId, opts.onlinePaise);
      return { kind: "refunded", reason: "expired", message: err.message };
    }
    if (err.code === "OUT_OF_STOCK") {
      await releasePendingOrder(opts.orderId, opts.userId);
      await refundRazorpayPayment(rp, opts.razorpayPaymentId, opts.onlinePaise);
      return { kind: "refunded", reason: "out_of_stock", message: `${err.message}. Your payment is being refunded.` };
    }
    throw err;
  }
}

/** Refunds a captured Razorpay payment (used when an order cannot be fulfilled after payment). */
export async function refundRazorpayPayment(rp: Razorpay, paymentId: string, amountPaise: number) {
  try {
    await rp.payments.refund(paymentId, { amount: amountPaise, speed: "normal" });
    return true;
  } catch (err) {
    console.error(`[Refund] FAILED for payment ${paymentId} (${paiseToDecimal(amountPaise)} INR). Refund manually.`, err);
    return false;
  }
}

/**
 * Cancels checkouts that were started but never paid, freeing their stock and returning any
 * wallet money. If Razorpay shows the online part was actually paid, the order is confirmed instead.
 */
export async function sweepExpiredCheckouts(rp: Razorpay | null) {
  const stale = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "pending"),
        eq(ordersTable.paymentStatus, "pending"),
        // Compared inside the database so the database clock/timezone cannot skew it.
        sql`${ordersTable.createdAt} < now() - make_interval(mins => ${CHECKOUT_HOLD_MINUTES})`,
      ),
    );

  let released = 0;
  let confirmed = 0;
  for (const order of stale) {
    try {
      if (rp && order.razorpayOrderId) {
        const providerOrder = await rp.orders.fetch(order.razorpayOrderId);
        const onlinePaise = toPaise(order.total) - toPaise(order.walletAmount);
        if (providerOrder.status === "paid" && Number(providerOrder.amount_paid) === onlinePaise) {
          // The customer did pay but the app never reported it; finish the order now.
          const payments = await rp.orders.fetchPayments(order.razorpayOrderId);
          const captured = payments.items.find((p: any) => p.status === "captured");
          if (captured) {
            await finalizeShopOrderPayment(rp, {
              orderId: order.id,
              userId: order.userId,
              razorpayPaymentId: captured.id,
              onlinePaise,
            });
            confirmed++;
            continue;
          }
        } else if (Number(providerOrder.amount_paid) > 0) {
          continue; // a partial/odd payment: leave it for a human to look at
        }
      }
      if (await releasePendingOrder(order.id)) released++;
    } catch (err) {
      console.error(`[Checkouts] Could not process order ${order.id}:`, err);
    }
  }
  return { released, confirmed };
}

export function startCheckoutSweeper(rp: Razorpay | null) {
  const run = () =>
    sweepExpiredCheckouts(rp)
      .then((r) => {
        if (r.released || r.confirmed) console.log(`[Checkouts] released ${r.released}, confirmed ${r.confirmed}`);
      })
      .catch((e) => console.error("[Checkouts] sweep failed:", e));
  setTimeout(run, 45_000);
  setInterval(run, 5 * 60_000);
  console.log(`[Checkouts] Sweeper started: unpaid checkouts release their stock after ${CHECKOUT_HOLD_MINUTES} minutes.`);
}
