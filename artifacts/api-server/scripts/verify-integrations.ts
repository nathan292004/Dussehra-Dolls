import { randomUUID, createHmac } from "crypto";
import { db, pool } from "@workspace/db";
import {
  usersTable, chitPlansTable, chitEnrollmentsTable, chitPaymentIntentsTable,
  walletsTable, transactionsTable, whatsappMessagesTable, whatsappPreferencesTable,
  productsTable, cartItemsTable, ordersTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { createChitPayment, settleChitPayment } from "../src/services/chit-payments";
import { generateToken } from "../src/lib/customer-credentials";
import app from "../src/app";
import { deliverOne } from "../src/lib/whatsapp-worker";
import type Razorpay from "razorpay";

const nonce = randomUUID().replace(/-/g, "");
const orderId = `order_${nonce}`;
const paymentId = `pay_${nonce}`;
let userId = 0, planId = 0, enrollmentId = 0, productId = 0, purchaseId = 0;
const provider = {
  orders: {
    create: async ({ amount }: { amount: number }) => ({ id: orderId, amount, currency: "INR" }),
    fetch: async () => ({ id: orderId, status: "paid", notes: { purpose: "chit_installment", userId: String(userId), enrollmentId: String(enrollmentId) } }),
  },
  payments: { fetch: async () => ({ id: paymentId, status: "captured", order_id: orderId, amount: 10000 }) },
} as unknown as Razorpay;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function main() {
  const nativeFetch = globalThis.fetch;
  let providerSends = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://graph.facebook.com/")) {
      providerSends++;
      const body = JSON.parse(String(init?.body || "{}"));
      assert(body.type === "template" && body.template?.name?.startsWith("dolldime_"), "WhatsApp must use an approved Meta template");
      assert(String((init?.headers as Record<string, string>)?.Authorization).startsWith("Bearer "), "Meta bearer token required");
      return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: `wamid.${providerSends}` }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return nativeFetch(input, init);
  }) as typeof fetch;
  const [user] = await db.insert(usersTable).values({ name: "Integration Test", email: `${nonce}@example.invalid`,
    phone: "+919000000001", passwordHash: "test" }).returning(); userId = user.id;
  const [plan] = await db.insert(chitPlansTable).values({ name: "Test doll plan", totalAmount: "100.00",
    monthlyContribution: "100.00", duration: 1, maxMembers: 1, currentMembers: 1 }).returning(); planId = plan.id;
  const [enrollment] = await db.insert(chitEnrollmentsTable).values({ userId, chitPlanId: planId }).returning(); enrollmentId = enrollment.id;
  await db.insert(whatsappPreferencesTable).values({ userId, orderUpdates: true, marketing: true, marketingOptedAt: new Date() });

  const intent = await createChitPayment(provider, userId, enrollmentId);
  assert(intent.amount === 10000, "Installment amount should be server calculated");
  const first = await settleChitPayment(provider, orderId, paymentId, userId);
  const second = await settleChitPayment(provider, orderId, paymentId, userId);
  assert(first.credited === 100 && second.credited === 0, "Payment must credit once");
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  assert(Number(wallet.balance) === 100, "Captured installment should fund store balance");
  const [paidEnrollment] = await db.select().from(chitEnrollmentsTable).where(eq(chitEnrollmentsTable.id, enrollmentId));
  assert(paidEnrollment.status === "completed", "Plan should complete");
  const chitMessages = await db.select().from(whatsappMessagesTable).where(eq(whatsappMessagesTable.userId, userId));
  assert(chitMessages.length === 1 && chitMessages[0].kind === "chit_payment", "Payment WhatsApp must be queued once");
  assert(await deliverOne(), "Queued installment notification should be processed");
  const [deliveredChit] = await db.select().from(whatsappMessagesTable).where(eq(whatsappMessagesTable.id, chitMessages[0].id));
  assert(deliveredChit.status === "accepted" && deliveredChit.providerSid?.startsWith("wamid."), "Provider should accept approved WhatsApp template");

  const [product] = await db.insert(productsTable).values({ name: "Test doll", category: "Dolls", price: "60.00", stock: 2 }).returning(); productId = product.id;
  await db.insert(cartItemsTable).values({ userId, productId, quantity: 1 });
  const server = app.listen(0);
  try {
    const address = "12 Test Road, Chennai, Tamil Nadu 600001";
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const token = generateToken(userId);
    const request = (path: string, init: RequestInit = {}) => fetch(`${origin}/api${path}`, {
      ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });
    const checkout = await request("/payment/checkout-with-wallet", { method: "POST", body: JSON.stringify({ address }) });
    assert(checkout.status === 200, `Store checkout failed: ${checkout.status}`);
    const checkoutData = await checkout.json() as { orderId: number }; purchaseId = checkoutData.orderId;
    const [spentWallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
    assert(Number(spentWallet.balance) === 40, "Store balance should be debited");
    const [purchasedProduct] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    assert(purchasedProduct.stock === 1, "Inventory should decrease");
    const order = await request(`/orders/${purchaseId}`);
    const orderData = await order.json() as { address: string; paymentStatus: string };
    assert(orderData.address === address && orderData.paymentStatus === "paid", "Order should retain delivery address and verified payment");
    assert(await deliverOne(), "Order confirmation should be processed");
    const callbackUrl = `${origin}/api/whatsapp/webhook`;
    const verify = await fetch(`${callbackUrl}?hub.mode=subscribe&hub.verify_token=${process.env.META_WHATSAPP_VERIFY_TOKEN}&hub.challenge=verified`);
    assert(verify.status === 200 && await verify.text() === "verified", "Meta webhook challenge should be accepted");
    const callbackBody = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: process.env.META_WHATSAPP_PHONE_NUMBER_ID }, statuses: [{ id: `wamid.${providerSends}`, status: "delivered" }],
    } }] }] });
    const callbackSignature = createHmac("sha256", process.env.META_APP_SECRET!).update(callbackBody).digest("hex");
    const rejected = await fetch(callbackUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body: callbackBody });
    assert(rejected.status === 403, "Unsigned Meta status must be rejected");
    const callback = await fetch(callbackUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": `sha256=${callbackSignature}` }, body: callbackBody });
    assert(callback.status === 200, "Signed delivery callback should be accepted");
    const [updatedMessage] = await db.select().from(whatsappMessagesTable).where(eq(whatsappMessagesTable.providerSid, `wamid.${providerSends}`));
    assert(updatedMessage.status === "delivered", "Delivery callback should update message status");
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(orderData.address)}`;
    assert(mapUrl.includes("api=1&query=") && mapUrl.includes("Chennai"), "Map URL must include address");
    const unauthorized = await fetch(`${origin}/api/wallet`, { headers: { Authorization: "Bearer v1.forged" } });
    assert(unauthorized.status === 401, "Forged customer token must be rejected");
    assert((await request("/wallet", { method: "POST", body: JSON.stringify({ amount: 10000 }) })).status === 410, "Unverified wallet credit must be disabled");
    assert((await request("/orders", { method: "POST", body: JSON.stringify({}) })).status === 410, "Unverified order creation must be disabled");
    const login = await fetch(`${origin}/api/admin/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
    assert(login.status === 200, "Admin login failed");
    const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
    const admin = await fetch(`${origin}/api/admin/whatsapp/summary`, { headers: { Cookie: cookie } });
    assert(admin.status === 200, "Admin message summary failed");
    const campaign = await fetch(`${origin}/api/admin/whatsapp/campaigns`, { method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ offer: "Test festive offer" }) });
    const campaignData = await campaign.json() as { queued: number };
    assert(campaign.status === 201 && campaignData.queued === 1, "Promotion should queue for opted-in customer");
    const pref = await request("/whatsapp/preferences", { method: "PUT", body: JSON.stringify({ orderUpdates: true, marketing: false }) });
    assert(pref.status === 200, "Customer must control promotional consent");
    const [saved] = await db.select().from(whatsappPreferencesTable).where(eq(whatsappPreferencesTable.userId, userId));
    assert(saved.orderUpdates && !saved.marketing, "Preferences must persist");
    assert(await deliverOne(), "Opted-out marketing message should be processed");
    const [cancelled] = await db.select().from(whatsappMessagesTable).where(and(eq(whatsappMessagesTable.userId, userId), eq(whatsappMessagesTable.kind, "marketing")));
    assert(cancelled.status === "cancelled" && providerSends === 2, "Opt-out must stop promotion delivery");
    const paymentEdit = await fetch(`${origin}/api/admin/orders/${purchaseId}/status`, { method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ paymentStatus: "pending" }) });
    assert(paymentEdit.status === 400, "Admin cannot override verified payment status");
    console.log("PASS: captured installment, idempotent credit, template WhatsApp delivery, opt-out, wallet purchase, inventory, address link, API security, admin access");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

async function cleanup() {
  if (!userId) return;
  await db.delete(whatsappMessagesTable).where(eq(whatsappMessagesTable.userId, userId));
  await db.delete(whatsappPreferencesTable).where(eq(whatsappPreferencesTable.userId, userId));
  if (purchaseId) await db.delete(ordersTable).where(eq(ordersTable.id, purchaseId));
  await db.delete(transactionsTable).where(eq(transactionsTable.userId, userId));
  await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, userId));
  await db.delete(walletsTable).where(eq(walletsTable.userId, userId));
  await db.delete(chitPaymentIntentsTable).where(eq(chitPaymentIntentsTable.userId, userId));
  if (enrollmentId) await db.delete(chitEnrollmentsTable).where(eq(chitEnrollmentsTable.id, enrollmentId));
  if (planId) await db.delete(chitPlansTable).where(eq(chitPlansTable.id, planId));
  if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await cleanup(); } catch (error) { console.error("Test cleanup failed", error); process.exitCode = 1; }
  await pool.end();
});
