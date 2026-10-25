// End-to-end test of the real API: user ids, auth, JWT, lockouts, forgot password, account
// deletion, money maths, wallet checkout, stock reservation, chit approval + payments,
// reminders and the admin dashboard, webhooks. Only Twilio and Razorpay are faked.
//
//   TEST_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/dolldime_test
//   pnpm --filter @workspace/api-server run test:e2e
//
// WARNING: this EMPTIES every table in the database it is pointed at. To protect real data it
// refuses to run unless the database name contains "test". Create the tables first with
// `pnpm --filter @workspace/db run migrate` using the same URL (DATABASE_URL=<that url>).
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb || !/test/i.test(new URL(testDb).pathname)) {
  console.error('Set TEST_DATABASE_URL to a throwaway database whose name contains "test".');
  process.exit(1);
}
process.env.DATABASE_URL = testDb;
process.env.NODE_ENV = "test";
process.env.RATE_LIMITS_OFF = "1";
process.env.BCRYPT_ROUNDS = "4";
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "x";
process.env.TWILIO_FROM_NUMBER = "+15005550006";
process.env.RAZORPAY_KEY_ID = "rzp_test_x";
process.env.RAZORPAY_KEY_SECRET = "secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
process.env.JWT_SECRET = "c".repeat(40);
process.env.ADMIN_TOKEN_SECRET = "a".repeat(40);

import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

// ---------- fake Twilio ----------
const sent: { to: string; body: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  if (String(url).includes("api.twilio.com")) {
    const p = new URLSearchParams(String(init.body));
    sent.push({ to: p.get("To")!, body: p.get("Body")! });
    return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
  }
  return realFetch(url, init);
}) as any;

const { db, pool } = await import("@workspace/db");
const s = await import("@workspace/db/schema");
const { eq } = await import("drizzle-orm");
const { default: app } = await import("../app");
const { razorpay } = await import("../lib/razorpay");
const { signAdminToken, hashAdminPassword } = await import("../lib/admin-auth");
const { sweepExpiredCheckouts } = await import("../lib/order-payments");
const { withNewUserId, generateUserId, isUserId } = await import("../lib/user-id");
const { walletShareFor } = await import("../routes/payment");
const { toPaise, parsePaise, paiseToDecimal, sumPaise, fromPaise } = await import("../lib/money");
const { sendChitReminders } = await import("../lib/chit-reminder-scheduler");
const { hashOtp } = await import("../lib/otp");

// ---------- fake Razorpay ----------
const rzOrders = new Map<string, any>();
const rzPayments = new Map<string, any>();
const refunds: any[] = [];
let seq = 1;
(razorpay as any).orders.create = async (p: any) => {
  const o = { id: `order_${seq++}`, amount: p.amount, currency: p.currency, notes: p.notes ?? {}, status: "created", amount_paid: 0 };
  rzOrders.set(o.id, o);
  return o;
};
(razorpay as any).orders.fetch = async (id: string) => {
  if (!rzOrders.has(id)) throw new Error("no such order");
  return rzOrders.get(id);
};
(razorpay as any).orders.fetchPayments = async (id: string) => ({
  items: [...rzPayments.values()].filter((p) => p.order_id === id),
});
(razorpay as any).payments.fetch = async (id: string) => {
  if (!rzPayments.has(id)) throw new Error("no such payment");
  return rzPayments.get(id);
};
(razorpay as any).payments.refund = async (id: string, p: any) => {
  refunds.push({ id, ...p });
  return {};
};
function gatewayPay(orderId: string, amount?: number) {
  const o = rzOrders.get(orderId);
  const amt = amount ?? o.amount;
  const id = `pay_${seq++}`;
  rzPayments.set(id, { id, order_id: orderId, amount: amt, status: "captured" });
  o.amount_paid += amt;
  if (o.amount_paid >= o.amount) o.status = "paid";
  const signature = crypto.createHmac("sha256", "secret").update(`${orderId}|${id}`).digest("hex");
  return { razorpayOrderId: orderId, razorpayPaymentId: id, razorpaySignature: signature };
}

// ---------- server + helpers ----------
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
const tick = (ms = 350) => new Promise((r) => setTimeout(r, ms));

import http from "node:http";
const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
function rawRequest(method: string, path: string, headers: Record<string, string>, payload?: string) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const u = new URL(base + path);
    const req = http.request(
      { host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers, agent },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode!, text }));
      },
    );
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
const savedAddressIds = new Map<string, number>();
/** Checkout needs a saved address; give each test customer one the first time they check out. */
async function withSavedAddress(token: string | undefined, body: any) {
  if (!token || !body || body.address === undefined) return body;
  const sub = (jwt.decode(token) as any)?.sub as string;
  let id = savedAddressIds.get(sub);
  if (!id) {
    const r = await rawRequest("POST", "/addresses", { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      JSON.stringify({ recipientName: "Test Receiver", phone: "9876543210", flatNumber: "12B", locality: "Festival Lane", city: "Chennai", state: "Tamil Nadu", pincode: "600001", latitude: 13.0827, longitude: 80.2707 }));
    assert.equal(r.status, 201, r.text);
    id = JSON.parse(r.text).address.id as number;
    savedAddressIds.set(sub, id);
  }
  const { address: _a, ...rest } = body;
  return { ...rest, addressId: id };
}
async function api(method: string, path: string, body?: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  if (method === "POST" && path === "/payment/create-order") body = await withSavedAddress(token, body);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const r = await rawRequest(method, path, {
    "Content-Type": "application/json",
    ...(payload !== undefined ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  }, payload);
  let json: any = null;
  try { json = JSON.parse(r.text); } catch { /* none */ }
  return { status: r.status, body: json };
}
const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;
const lastOtp = (phone: string) => {
  for (let i = sent.length - 1; i >= 0; i--) {
    if (sent[i].to === phone && sent[i].body.includes("verification code")) return /(\d{6})\./.exec(sent[i].body)![1];
  }
  throw new Error("no otp sent to " + phone + " :: " + JSON.stringify(sent));
};
const freeResend = (phone: string) => q("update otp_verifications set created_at = created_at - interval '2 minutes' where phone=$1", [phone]);
const waMessages = (phone: string) => sent.filter((m) => m.to === `whatsapp:${phone}` || m.to === phone).map((m) => m.body);

let n = 0;
async function signup(tenDigits: string, name = "Cust", password = "secret123") {
  const phone = "+91" + tenDigits;
  const a = await api("POST", "/auth/send-otp", { phone: tenDigits });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const r = await api("POST", "/auth/register", { fname: name, lname: "Tester", phone: tenDigits, password, otp: lastOtp(phone) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { token: r.body.token as string, id: r.body.user.id as string, phone, tenDigits, password };
}
const phoneN = () => String(9100000000 + ++n);
const wallet = async (userId: string) => (await q("select balance::text b, chit_locked_balance::text l from wallets where user_id=$1", [userId]))[0];
const setWallet = (userId: string, balance: string, locked = "0") =>
  q(`insert into wallets (user_id, balance, chit_locked_balance) values ($1,$2,$3)
     on conflict (user_id) do update set balance=$2, chit_locked_balance=$3`, [userId, balance, locked]);
const stockOf = async (pid: number) => (await q("select stock from products where id=$1", [pid]))[0].stock as number;
const reservedOf = async (pid: number) => (await q("select reserved_stock from products where id=$1", [pid]))[0].reserved_stock as number;
/** Frozen stock must always equal what the unpaid checkouts actually hold. */
async function assertStockInvariant(label: string) {
  const held = await q(`select (it->>'productId')::int as pid, sum((it->>'quantity')::int)::int as q
    from orders o, jsonb_array_elements(o.items) it
    where o.status='pending' and o.payment_status='pending' and o.stock_reserved group by 1`);
  const want = new Map(held.map((h2: any) => [h2.pid, h2.q]));
  const rows = await q("select id, stock, reserved_stock from products");
  for (const p2 of rows) {
    assert.equal(p2.reserved_stock, want.get(p2.id) ?? 0, `${label}: product ${p2.id} reserved_stock must equal what pending checkouts hold`);
    assert.ok(p2.reserved_stock >= 0 && p2.reserved_stock <= p2.stock, `${label}: 0 <= reserved <= stock`);
  }
}
const section = (t: string) => console.log("\n== " + t);
const ok = (t: string) => console.log("  ok  " + t);

// ---------- start from an empty database ----------
{
  const tables = (await pool.query("select tablename from pg_tables where schemaname = 'public'")).rows.map((r: any) => `"${r.tablename}"`);
  await pool.query(`truncate ${tables.join(",")} restart identity cascade`);
}

// ---------- admin + products ----------
const [adm] = await db.insert(s.adminUsersTable).values({ username: "boss", name: "Boss", passwordHash: await hashAdminPassword("passwordpassword"), sessionId: "session-1" }).returning();
let adminToken = signAdminToken(adm, "session-1");
async function makeProduct(name: string, price: string, stock = 10) {
  const r = await api("POST", "/admin/products", { name, price, category: "Traditional", stock }, adminToken);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id as number;
}
async function fillCart(token: string, items: [number, number][]) {
  for (const [productId, quantity] of items) {
    const r = await api("POST", "/cart", { productId, quantity }, token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
}

// =====================================================================================
section("C8 money helpers");
assert.equal(toPaise("19.99"), 1999); assert.equal(toPaise("0.10"), 10); assert.equal(toPaise(0.1), 10);
assert.equal(toPaise("499"), 49900); assert.equal(toPaise(1234.5), 123450);
assert.equal(parsePaise(19.999), null); assert.equal(parsePaise("abc"), null); assert.equal(parsePaise(NaN), null);
assert.equal(parsePaise("1.234"), null); assert.equal(parsePaise(Infinity), null);
assert.equal(paiseToDecimal(5), "0.05"); assert.equal(paiseToDecimal(49950), "499.50"); assert.equal(paiseToDecimal(0), "0.00");
assert.equal(sumPaise([toPaise("0.10"), toPaise("0.20")]), 30);
assert.notEqual(0.1 + 0.2, 0.3); // proves why floats were a problem
assert.equal(fromPaise(sumPaise([toPaise("0.10"), toPaise("0.20")])), 0.3);
assert.throws(() => paiseToDecimal(1.5));
ok("paise helpers exact; floats rejected");

section("C7 wallet share rule");
assert.equal(walletShareFor(100000, 40000), 40000);          // wallet covers all
assert.equal(walletShareFor(30000, 100000), 30000);          // partial
assert.equal(walletShareFor(0, 100000), 0);
assert.equal(walletShareFor(99950, 100000), 99900);          // would leave 50 paise online -> leave 1 rupee
assert.equal(walletShareFor(99900, 100000), 99900);          // leaves exactly 1 rupee
assert.equal(walletShareFor(-5, 100000), 0);
ok("wallet share rule");

// =====================================================================================
section("User id generation");
{
  const ids = new Set<string>();
  for (let i = 0; i < 2000; i++) ids.add(generateUserId());
  assert.ok(ids.size > 1990, "ids are random (2000 generated, " + ids.size + " distinct)");
  for (const id of ids) assert.ok(isUserId(id));
  assert.match(generateUserId(new Date("2026-03-07T10:00:00+05:30")), /^user_070326[A-Za-z]{5}$/);
  // at 00:30 IST on 1 Jan the UTC date is still 31 Dec: the id uses the Indian date
  assert.match(generateUserId(new Date("2026-12-31T19:00:00Z")), /^user_010127[A-Za-z]{5}$/);
  const letters = [...ids].map((i) => i.slice(11)).join("");
  assert.ok(/[a-z]/.test(letters) && /[A-Z]/.test(letters), "both upper and lower case letters are used");
  assert.equal(isUserId("user_1234"), false); assert.equal(isUserId("user_26102611abcde"), false); assert.equal(isUserId(undefined), false);
  // a clash on the primary key is retried with a new id; any other error is not
  let calls = 0; const seen: string[] = [];
  const clash = Object.assign(new Error("dup"), { code: "23505", constraint: "users_pkey" });
  const got = await withNewUserId(async (id) => { seen.push(id); if (++calls <= 2) throw clash; return id; });
  assert.equal(calls, 3); assert.equal(got, seen[2]); assert.equal(new Set(seen).size, 3);
  calls = 0;
  await assert.rejects(withNewUserId(async () => { calls++; throw clash; }), (e: any) => e === clash);
  assert.equal(calls, 6, "gives up after 6 attempts");
  calls = 0;
  await assert.rejects(withNewUserId(async () => { calls++; throw Object.assign(new Error("phone"), { code: "23505", constraint: "users_active_phone_unique" }); }));
  assert.equal(calls, 1, "a phone-number clash is not retried as an id clash");
  ok("2000 ids random and well-formed; Indian-date prefix; clash retried 6 times; other errors not retried");
}

section("C5 registration");
assert.equal((await api("POST", "/auth/send-otp", { phone: "123" })).status, 400);
assert.equal((await api("POST", "/auth/send-otp", { phone: "abcdefghijk" })).status, 400);
const ph1 = phoneN();
const u1 = await signup(ph1, "Asha", "pass1234");
ok("register works, JWT issued");
const hashRow = (await q("select * from users where user_id=$1", [u1.id]))[0];
assert.match(hashRow.password_hash, /^\$2[aby]\$/); assert.equal(hashRow.is_deleted, false);
ok("password stored as bcrypt");
// the new user model
assert.match(u1.id, /^user_\d{6}[A-Za-z]{5}$/, "user id format");
assert.ok(isUserId(u1.id));
const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
const expectDate = String(istNow.getUTCDate()).padStart(2, "0") + String(istNow.getUTCMonth() + 1).padStart(2, "0") + String(istNow.getUTCFullYear() % 100).padStart(2, "0");
assert.equal(u1.id.slice(5, 11), expectDate, "date part is today's ddmmyy");
assert.ok(!("email" in hashRow), "no email column");
assert.equal(hashRow.fname, "Asha"); assert.equal(hashRow.lname, "Tester");
assert.equal(hashRow.phone, "+91" + ph1); assert.equal(hashRow.address, null);
assert.equal(hashRow.is_reseller, false); assert.equal(hashRow.reseller_code, null);
assert.ok(hashRow.registered_at); assert.equal(typeof hashRow.index, "number");
const u1b = await signup(phoneN(), "Second", "pass1234");
const idx = (await q("select index from users where user_id = any($1) order by index", [[u1.id, u1b.id]])).map((r2: any) => r2.index);
assert.equal(idx[1], idx[0] + 1, "index counts up by one per registration");
assert.equal(u1.id === u1b.id, false);
const mePublic = await api("GET", "/auth/me", undefined, u1.token);
assert.equal(mePublic.body.userId, u1.id); assert.equal(mePublic.body.id, u1.id); assert.equal(mePublic.body.name, "Asha Tester");
assert.ok(!("email" in mePublic.body));
ok("user id user_ddmmyy+5 letters, running index, fname/lname/phone/address/reseller fields, no email");
assert.equal((await wallet(u1.id)).b, "0.00");

// number already registered
let r = await api("POST", "/auth/send-otp", { phone: ph1 });
assert.equal(r.status, 409); assert.equal(r.body.code, "PHONE_ALREADY_REGISTERED"); assert.match(r.body.error, /already registered/);
r = await api("POST", "/auth/send-otp", { phone: "+91" + ph1 }); assert.equal(r.status, 409);
r = await api("POST", "/auth/send-otp", { phone: "0" + ph1 }); assert.equal(r.status, 409);
r = await api("POST", "/auth/send-otp", { phone: ph1.slice(0, 5) + " " + ph1.slice(5) }); assert.equal(r.status, 409);
r = await api("POST", "/auth/register", { fname: "Dup", phone: ph1, password: "abcdef", otp: "123456" });
assert.equal(r.status, 409); assert.equal(r.body.code, "PHONE_ALREADY_REGISTERED");
ok("existing number rejected in every phone format, at send-otp and register");

// validation
const phV = phoneN();
await api("POST", "/auth/send-otp", { phone: phV });
const otpV = lastOtp("+91" + phV);
for (const [body, label] of [
  [{ fname: "   ", phone: phV, password: "abcdef", otp: otpV }, "short name"],
  [{ fname: "Ab", phone: phV, password: "abc", otp: otpV }, "short password"],
  [{ fname: "Ab", phone: phV, password: "x".repeat(73), otp: otpV }, "password over 72 bytes"],
  [{ fname: "Ab", phone: phV, password: "abcdef", otp: "12" }, "bad otp format"],
  [{ fname: "Ab", phone: "12", password: "abcdef", otp: otpV }, "bad phone"],
  [{ phone: phV, password: "abcdef", otp: otpV }, "missing name"],
  [{ fname: "x".repeat(51), phone: phV, password: "abcdef", otp: otpV }, "first name too long"],
  [{ fname: "Ab", lname: "y".repeat(51), phone: phV, password: "abcdef", otp: otpV }, "last name too long"],
] as const) {
  const x = await api("POST", "/auth/register", body);
  assert.equal(x.status, 400, label + " " + JSON.stringify(x.body));
}
ok("register validation");

// OTP: 5 wrong attempts kills the code
for (let i = 1; i <= 4; i++) {
  const x = await api("POST", "/auth/register", { fname: "Vik", phone: phV, password: "abcdef", otp: otpV === "000000" ? "111111" : "000000" });
  assert.equal(x.status, 400); assert.match(x.body.error, new RegExp(`${5 - i} attempt`));
}
let x = await api("POST", "/auth/register", { fname: "Vik", phone: phV, password: "abcdef", otp: otpV === "000000" ? "111111" : "000000" });
assert.equal(x.status, 429); assert.match(x.body.error, /request a new OTP/);
x = await api("POST", "/auth/register", { fname: "Vik", phone: phV, password: "abcdef", otp: otpV });
assert.equal(x.status, 429); // even the correct code is dead after 5 wrong tries
ok("OTP dies after 5 wrong attempts (even the right code is refused)");
// resend throttle + new code works
x = await api("POST", "/auth/send-otp", { phone: phV }); assert.equal(x.status, 429); assert.match(x.body.error, /1 minute/);
await freeResend("+91" + phV);
x = await api("POST", "/auth/send-otp", { phone: phV }); assert.equal(x.status, 200);
const otpV2 = lastOtp("+91" + phV);
x = await api("POST", "/auth/register", { fname: "Vik", phone: phV, password: "abcdef", otp: otpV2 }); assert.equal(x.status, 201);
ok("new OTP after lock works; 1-minute resend throttle");
// reuse of a used OTP
x = await api("POST", "/auth/register", { fname: "Vik2", phone: phV, password: "abcdef", otp: otpV2 }); assert.equal(x.status, 409);
ok("used OTP cannot register again");

// hourly cap
const phH = phoneN();
for (let i = 0; i < 5; i++) {
  const y = await api("POST", "/auth/send-otp", { phone: phH }); assert.equal(y.status, 200, "send " + i);
  await freeResend("+91" + phH);
}
x = await api("POST", "/auth/send-otp", { phone: phH }); assert.equal(x.status, 429); assert.match(x.body.error, /hour/);
ok("max 5 OTP sends per hour per number");

// expiry
const phE = phoneN();
await api("POST", "/auth/send-otp", { phone: phE });
await db.update(s.otpVerificationsTable).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(s.otpVerificationsTable.phone, "+91" + phE));
x = await api("POST", "/auth/register", { fname: "Exp", phone: phE, password: "abcdef", otp: lastOtp("+91" + phE) });
assert.equal(x.status, 400); assert.match(x.body.error, /expired/);
ok("expired OTP refused");

// race: two registrations with the same number at the same time
const phR = phoneN();
await api("POST", "/auth/send-otp", { phone: phR });
const otpR = lastOtp("+91" + phR);
const both = await Promise.all([1, 2].map((i) => api("POST", "/auth/register", { fname: "Race" + i, phone: phR, password: "abcdef", otp: otpR })));
assert.equal(both.filter((b) => b.status === 201).length, 1, JSON.stringify(both.map((b) => b.status)));
assert.equal((await q("select count(*)::int c from users where phone=$1 and is_deleted=false", ["+91" + phR]))[0].c, 1);
ok("simultaneous registrations: exactly one account");

// SMS failure: code is soft-deleted, never removed
const phF = phoneN();
const smsStub = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => String(url).includes("api.twilio.com")
  ? new Response(JSON.stringify({ code: 21608 }), { status: 400 }) : realFetch(url, init)) as any;
x = await api("POST", "/auth/send-otp", { phone: phF });
globalThis.fetch = smsStub;
assert.equal(x.status, 503);
const failed = await q("select is_deleted from otp_verifications where phone=$1", ["+91" + phF]);
assert.equal(failed.length, 1); assert.equal(failed[0].is_deleted, true);
x = await api("POST", "/auth/send-otp", { phone: phF }); assert.equal(x.status, 200); // not throttled by the failed one
ok("failed SMS: code soft-deleted (row kept), customer can retry at once");

// =====================================================================================
section("C2 JWT");
const me = await api("GET", "/auth/me", undefined, u1.token);
assert.equal(me.status, 200); assert.equal(me.body.phone, u1.phone);
const decoded: any = jwt.decode(u1.token, { complete: true });
assert.equal(decoded.header.alg, "HS256"); assert.equal(decoded.payload.aud, "dolldime-customer");
assert.equal(decoded.payload.sub, u1.id); assert.ok(decoded.payload.exp - decoded.payload.iat === 365 * 86400);
ok("valid JWT: HS256, audience, subject, 30 day expiry");
const secret = "c".repeat(40);
const mk = (o: any = {}, sec = secret) => jwt.sign({}, sec, { algorithm: "HS256", subject: u1.id, audience: "dolldime-customer", issuer: "dolldime", expiresIn: 3600, ...o });
for (const [tok, label] of [
  ["", "empty"], ["garbage", "garbage"],
  [u1.token.slice(0, -2) + (u1.token.endsWith("AA") ? "BB" : "AA"), "tampered signature"],
  [mk({ expiresIn: -10 }), "expired"],
  [mk({}, "z".repeat(40)), "wrong secret"],
  [mk({ audience: "dolldime-admin" }), "wrong audience"],
  [mk({ issuer: "evil" }), "wrong issuer"],
  [mk({ subject: "user_010100zzzzz" }), "unknown user"],
  [mk({ subject: "5" }), "old numeric-style subject"],
  [Buffer.from(`${u1.id}:${Date.now()}:0.5`).toString("base64url"), "old forgeable token format"],
  [signAdminToken(adm, "session-1"), "admin token on customer route"],
  [`${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: u1.id, aud: "dolldime-customer", iss: "dolldime", exp: 9999999999 })).toString("base64url")}.`, "alg none"],
] as const) {
  const y = await api("GET", "/wallet", undefined, tok || undefined);
  assert.equal(y.status, 401, label);
}
assert.equal((await api("GET", "/wallet")).status, 401);
assert.equal((await api("GET", "/admin/stats", undefined, u1.token)).status, 401);
ok("forged / expired / wrong-key / wrong-audience / none-alg / admin-on-customer tokens all rejected");
assert.equal((await api("GET", "/wallet", undefined, u1.token)).status, 200);

// =====================================================================================
section("C6 login lockout (5 attempts)");
const lk = await signup(phoneN(), "Lock", "rightpass");
for (let i = 1; i <= 4; i++) {
  const y = await api("POST", "/auth/login", { phone: lk.tenDigits, password: "wrong" + i });
  assert.equal(y.status, 401);
}
let y = await api("POST", "/auth/login", { phone: lk.tenDigits, password: "wrong5" });
assert.equal(y.status, 429); assert.equal(y.body.code, "ACCOUNT_LOCKED"); assert.match(y.body.error, /15 minutes/);
y = await api("POST", "/auth/login", { phone: lk.tenDigits, password: "rightpass" });
assert.equal(y.status, 429); // correct password still refused while locked
ok("5 wrong passwords lock for 15 min; correct password refused while locked");
await db.update(s.usersTable).set({ lockedUntil: new Date(Date.now() - 60_000) }).where(eq(s.usersTable.userId, lk.id));
y = await api("POST", "/auth/login", { phone: lk.tenDigits, password: "nope" });
assert.equal(y.status, 401);
assert.equal((await q("select failed_login_attempts f from users where user_id=$1", [lk.id]))[0].f, 1);
y = await api("POST", "/auth/login", { phone: lk.tenDigits, password: "rightpass" });
assert.equal(y.status, 200);
assert.equal((await q("select failed_login_attempts f, locked_until l from users where user_id=$1", [lk.id]))[0].f, 0);
ok("after the lock ends the count restarts; success clears the counter");
// formats and unknown number
for (const fmt of [lk.tenDigits, "+91" + lk.tenDigits, "91" + lk.tenDigits, "0" + lk.tenDigits]) {
  assert.equal((await api("POST", "/auth/login", { phone: fmt, password: "rightpass" })).status, 200, fmt);
}
y = await api("POST", "/auth/login", { phone: "9999999999", password: "whatever" });
assert.equal(y.status, 401); assert.equal(y.body.error, "Invalid phone number or password");
assert.equal((await api("POST", "/auth/login", { phone: lk.tenDigits })).status, 400);
ok("login works with any phone format; unknown number gets the same generic error");
// per-IP limiter really works when switched on
delete process.env.RATE_LIMITS_OFF;
let limited = 0;
for (let i = 0; i < 14; i++) { if ((await api("POST", "/auth/login", { phone: "9999999998", password: "x" })).status === 429) limited++; }
process.env.RATE_LIMITS_OFF = "1";
assert.ok(limited >= 3, "per-IP limiter should trip, got " + limited);
ok("per-IP auth rate limit trips (" + limited + " blocked of 14)");

// =====================================================================================
section("C4 removed endpoints");
for (const [m, p] of [["POST", "/wallet"], ["POST", "/orders"], ["PUT", "/wallet"], ["DELETE", "/orders/1"]] as const) {
  const z = await api(m, p, { amount: 1000000, address: "x" }, u1.token);
  assert.ok([404, 410].includes(z.status), `${m} ${p}`);
}
assert.equal((await wallet(u1.id)).b, "0.00");
ok("POST /wallet and POST /orders no longer exist; wallet unchanged");

// =====================================================================================
section("C5 forgot password");
const fp = await signup(phoneN(), "Forgetful", "oldpass1");
await setWallet(fp.id, "500.00", "250.00");
await q("insert into transactions (user_id, type, amount, description) values ($1,'credit','500.00','seed')", [fp.id]);
await q(`insert into orders (user_id, status, payment_status, items, total, wallet_amount) values ($1,'delivered','paid','[]','10.00','0')`, [fp.id]);
const pFP = await makeProduct("FP Doll", "10.00", 5);
await fillCart(fp.token, [[pFP, 2]]);
const enrFP = await api("POST", "/chits/enroll-custom", { chits: 1 }, fp.token); assert.equal(enrFP.status, 201);
// unknown number
x = await api("POST", "/auth/send-otp", { phone: "9000000001", purpose: "reset" });
assert.equal(x.status, 404); assert.equal(x.body.code, "PHONE_NOT_REGISTERED");
x = await api("POST", "/auth/reset-password", { phone: "9000000001", otp: "123456", newPassword: "newpass12" });
assert.equal(x.status, 404);
// real flow
await freeResend(fp.phone);
x = await api("POST", "/auth/send-otp", { phone: fp.tenDigits, purpose: "reset" }); assert.equal(x.status, 200);
const resetOtp = lastOtp(fp.phone);
// a registration-purpose code must not work for reset
await q("insert into otp_verifications (phone, otp_hash, purpose, expires_at) values ($1,$2,'register', now() + interval '10 minutes')", [fp.phone, hashOtp(fp.phone, "register", "111111")]);
x = await api("POST", "/auth/reset-password", { phone: fp.tenDigits, otp: "111111", newPassword: "newpass12" });
assert.equal(x.status, 400);
ok("registration OTP rejected for password reset");
x = await api("POST", "/auth/reset-password", { phone: fp.tenDigits, otp: resetOtp, newPassword: "abc" }); assert.equal(x.status, 400);
const reset = await api("POST", "/auth/reset-password", { phone: fp.tenDigits, otp: resetOtp, newPassword: "newpass12" });
assert.equal(reset.status, 200, JSON.stringify(reset.body));
const newId = reset.body.user.id;
assert.notEqual(newId, fp.id);
const rows = await q("select user_id, is_deleted, deletion_reason, deleted_at, fname, lname, registered_at, password_hash, index from users where phone=$1 order by index", [fp.phone]);
assert.equal(rows.length, 2);
assert.equal(rows[0].user_id, fp.id); assert.equal(rows[0].is_deleted, true); assert.equal(rows[0].deletion_reason, "password_reset"); assert.ok(rows[0].deleted_at);
assert.equal(rows[1].user_id, newId); assert.equal(rows[1].is_deleted, false); assert.equal(rows[1].fname, "Forgetful");
assert.ok(isUserId(newId)); assert.equal(rows[1].lname, "Tester");
assert.equal(String(rows[1].registered_at), String(rows[0].registered_at), "original registration date is kept");
assert.notEqual(rows[0].password_hash, rows[1].password_hash);
ok("old row soft-deleted (password_reset), new live row created with same number");
x = await api("POST", "/auth/login", { phone: fp.tenDigits, password: "oldpass1" }); assert.equal(x.status, 401);
x = await api("POST", "/auth/login", { phone: fp.tenDigits, password: "newpass12" }); assert.equal(x.status, 200); assert.equal(x.body.user.id, newId);
assert.equal((await api("GET", "/wallet", undefined, fp.token)).status, 401);
assert.equal((await api("GET", "/wallet", undefined, reset.body.token)).status, 200);
ok("old password and old token dead; new password works");
// nothing lost
const w2 = await api("GET", "/wallet", undefined, reset.body.token);
assert.equal(w2.body.balance, 500); assert.equal(w2.body.lockedBalance, 250);
assert.ok(w2.body.transactions.length >= 1);
assert.equal((await q("select count(*)::int c from orders where user_id=$1", [newId]))[0].c, 1);
assert.equal((await q("select count(*)::int c from orders where user_id=$1", [fp.id]))[0].c, 0);
assert.equal((await api("GET", "/cart", undefined, reset.body.token)).body.items.length, 1);
const myChits = await api("GET", "/chits/my", undefined, reset.body.token); assert.equal(myChits.body.length, 1);
assert.equal((await q("select count(*)::int c from wallets where user_id=$1", [fp.id]))[0].c, 0);
ok("wallet, locked chit money, orders, cart and chit plans all moved to the new account");
x = await api("POST", "/auth/reset-password", { phone: fp.tenDigits, otp: resetOtp, newPassword: "another12" }); assert.equal(x.status, 400);
ok("reset OTP is single-use");
// brute force on reset
await freeResend(fp.phone);
await api("POST", "/auth/send-otp", { phone: fp.tenDigits, purpose: "reset" });
const rOtp2 = lastOtp(fp.phone);
for (let i = 0; i < 5; i++) await api("POST", "/auth/reset-password", { phone: fp.tenDigits, otp: rOtp2 === "222222" ? "333333" : "222222", newPassword: "zzzzzz1" });
x = await api("POST", "/auth/reset-password", { phone: fp.tenDigits, otp: rOtp2, newPassword: "zzzzzz1" }); assert.equal(x.status, 429);
assert.equal((await q("select count(*)::int c from users where phone=$1", [fp.phone]))[0].c, 2);
ok("reset OTP also dies after 5 wrong attempts; no extra account rows created");

// =====================================================================================
section("C5 delete account");
const del = await signup(phoneN(), "Leaver", "leavepass");
assert.equal((await api("DELETE", "/auth/account", {}, del.token)).status, 400);
assert.equal((await api("DELETE", "/auth/account", { password: "bad" }, del.token)).status, 403);
assert.equal((await api("DELETE", "/auth/account", { password: "leavepass" })).status, 401); // no token
// blockers
await setWallet(del.id, "50.00");
x = await api("DELETE", "/auth/account", { password: "leavepass" }, del.token); assert.equal(x.status, 409); assert.match(x.body.error, /wallet/);
await setWallet(del.id, "0", "100.00");
x = await api("DELETE", "/auth/account", { password: "leavepass" }, del.token); assert.equal(x.status, 409); assert.match(x.body.error, /chit/);
await setWallet(del.id, "0", "0");
const openOrder = (await q(`insert into orders (user_id, status, payment_status, items, total) values ($1,'shipped','paid','[]','10') returning id`, [del.id]))[0].id;
x = await api("DELETE", "/auth/account", { password: "leavepass" }, del.token); assert.equal(x.status, 409); assert.match(x.body.error, /not delivered/);
await q("update orders set status='delivered' where id=$1", [openOrder]);
// pending order holding wallet money blocks
const holdOrder = (await q(`insert into orders (user_id, status, payment_status, items, total, wallet_amount) values ($1,'pending','pending','[]','10','5') returning id`, [del.id]))[0].id;
x = await api("DELETE", "/auth/account", { password: "leavepass" }, del.token); assert.equal(x.status, 409);
await q("update orders set status='cancelled', payment_status='cancelled' where id=$1", [holdOrder]);
ok("deletion blocked by wallet money, locked chit money, undelivered order, held checkout");
const enrDel = await api("POST", "/chits/enroll-custom", { chits: 2 }, del.token); assert.equal(enrDel.status, 201);
x = await api("DELETE", "/auth/account", { password: "leavepass" }, del.token);
assert.equal(x.status, 200, JSON.stringify(x.body));
const gone = (await q("select is_deleted, deletion_reason, deleted_at from users where user_id=$1", [del.id]))[0];
assert.equal(gone.is_deleted, true); assert.equal(gone.deletion_reason, "account_deleted"); assert.ok(gone.deleted_at);
assert.equal((await q("select status from chit_plans where id=$1", [enrDel.body.id]))[0].status, "cancelled");
assert.equal((await q("select count(*)::int c from orders where user_id=$1", [del.id]))[0].c, 2);
ok("account soft-deleted; row, orders and the (unpaid) chit enrolment kept");
assert.equal((await api("GET", "/wallet", undefined, del.token)).status, 401);
assert.equal((await api("POST", "/auth/login", { phone: del.tenDigits, password: "leavepass" })).status, 401);
ok("deleted account's token and password stop working");
// the number is free again
await freeResend(del.phone);
x = await api("POST", "/auth/send-otp", { phone: del.tenDigits }); assert.equal(x.status, 200);
const again = await api("POST", "/auth/register", { fname: "Leaver Again", phone: del.tenDigits, password: "second123", otp: lastOtp(del.phone) });
assert.equal(again.status, 201); assert.notEqual(again.body.user.id, del.id);
assert.equal((await q("select count(*)::int c from users where phone=$1", [del.phone]))[0].c, 2);
assert.equal((await q("select count(*)::int c from users where phone=$1 and is_deleted=false", [del.phone]))[0].c, 1);
assert.equal((await api("GET", "/chits/my", undefined, again.body.token)).body.length, 0);
ok("same number registers again as a brand-new account (old data stays with the old row)");
// password lockout on delete
const del2 = await signup(phoneN(), "Del2", "delpass22");
for (let i = 0; i < 4; i++) assert.equal((await api("DELETE", "/auth/account", { password: "no" + i }, del2.token)).status, 403);
assert.equal((await api("DELETE", "/auth/account", { password: "no5" }, del2.token)).status, 429);
assert.equal((await api("DELETE", "/auth/account", { password: "delpass22" }, del2.token)).status, 429);
ok("wrong passwords on delete count toward the same 5-attempt lock");

// =====================================================================================
section("admin login + products (C8 validation)");
x = await api("POST", "/admin/auth/login", { username: "boss", password: "nope" }); assert.equal(x.status, 401);
for (let i = 0; i < 3; i++) await api("POST", "/admin/auth/login", { username: "boss", password: "nope" });
x = await api("POST", "/admin/auth/login", { username: "boss", password: "nope" }); assert.equal(x.status, 429);
x = await api("POST", "/admin/auth/login", { username: "boss", password: "passwordpassword" }); assert.equal(x.status, 429);
await db.update(s.adminUsersTable).set({ lockedUntil: new Date(Date.now() - 60_000) });
x = await api("POST", "/admin/auth/login", { username: "boss", password: "passwordpassword" }); assert.equal(x.status, 200);
assert.equal(jwt.decode(x.body.token, { json: true })!.aud, "dolldime-admin");
assert.equal((await api("GET", "/admin/stats", undefined, x.body.token)).status, 200);
assert.equal((await api("GET", "/admin/stats", undefined, u1.token)).status, 401);
ok("admin login: 5-attempt lock, JWT with admin audience, customer token refused");

// =====================================================================================
section("only one admin session at a time + audit log");
{
  // The earlier login replaced the session the test started with.
  const stale = await api("GET", "/admin/stats", undefined, adminToken);
  assert.equal(stale.status, 401); assert.equal(stale.body.code, "SESSION_REPLACED");
  const first = x.body.token as string;
  const second = await api("POST", "/admin/auth/login", { username: "boss", password: "passwordpassword" });
  assert.equal(second.status, 200);
  assert.equal((await api("GET", "/admin/stats", undefined, first)).status, 401, "first session is signed out by the second login");
  assert.equal((await api("GET", "/admin/stats", undefined, second.body.token)).status, 200);
  adminToken = second.body.token;

  // Every change is written to the audit log (and secrets are never stored).
  const made = await api("POST", "/admin/vendors", { name: "Audit Vendor", phone: "98765 43210", password: "should-not-be-stored" }, adminToken);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  await tick(300);
  const logRows = await q("select action, admin_username, status_code, details from admin_audit_log order by id");
  assert.ok(logRows.some((r: any) => r.action === "login" && r.admin_username === "boss"));
  assert.ok(logRows.some((r: any) => r.action === "login_failed"));
  const vendorRow = logRows.find((r: any) => r.action === "vendors.create");
  assert.ok(vendorRow && vendorRow.status_code === 201 && vendorRow.admin_username === "boss");
  assert.equal(vendorRow.details.password, "[hidden]");
  const auditApi = await api("GET", "/admin/auth/audit-log?q=vendors", undefined, adminToken);
  assert.equal(auditApi.status, 200); assert.ok(auditApi.body.items.length >= 1 && auditApi.body.total >= 1);
  assert.equal((await api("GET", "/admin/auth/audit-log", undefined, u1.token)).status, 401);

  // Logout ends the session.
  const third = await api("POST", "/admin/auth/login", { username: "boss", password: "passwordpassword" });
  assert.equal((await api("POST", "/admin/auth/logout", {}, third.body.token)).status, 200);
  assert.equal((await api("GET", "/admin/stats", undefined, third.body.token)).status, 401);
  const fourth = await api("POST", "/admin/auth/login", { username: "boss", password: "passwordpassword" });
  adminToken = fourth.body.token;
  assert.equal((await api("DELETE", `/admin/vendors/${made.body.id}`, undefined, adminToken)).status, 200);
  ok("one live admin session (new login signs the old one out), logout works, audit log records logins and changes without secrets");
}
for (const bad of [19.999, "abc", -1, "1.234", null]) {
  const z = await api("POST", "/admin/products", { name: "Bad", price: bad, category: "X" }, adminToken);
  assert.equal(z.status, 400, "price " + bad);
}
x = await api("POST", "/admin/products", { name: "Odd", price: 19.99, originalPrice: "25.50", category: "X" }, adminToken);
assert.equal(x.status, 201); assert.equal(x.body.price, 19.99); assert.equal(x.body.originalPrice, 25.5);
assert.equal((await q("select price::text p from products where id=$1", [x.body.id]))[0].p, "19.99");
assert.equal((await api("PUT", `/admin/products/${x.body.id}`, { price: 5.555 }, adminToken)).status, 400);
assert.equal((await api("PUT", `/admin/products/${x.body.id}`, { price: "7.05" }, adminToken)).body.price, 7.05);
ok("product prices validated strictly (no silent rounding)");
const usersList = await api("GET", "/admin/users?status=closed&pageSize=100", undefined, adminToken);
assert.ok(usersList.body.items.some((u: any) => u.isDeleted === true && u.deletionReason === "password_reset"));
assert.ok(usersList.body.items.some((u: any) => u.isDeleted === true && u.deletionReason === "account_deleted"));
ok("admin users list shows soft-deleted accounts");

// =====================================================================================
section("C8 exact totals in the cart and orders");
const cheap1 = await makeProduct("Ten paise", "0.10", 50);
const cheap2 = await makeProduct("Twenty paise", "0.20", 50);
const p1999 = await makeProduct("Odd price", "19.99", 50);
const mt = await signup(phoneN(), "Money", "moneypass");
await fillCart(mt.token, [[cheap1, 1], [cheap2, 1]]);
let cart = await api("GET", "/cart", undefined, mt.token);
assert.equal(cart.body.total, 0.3);
await api("DELETE", `/cart/${cheap1}`, undefined, mt.token); await api("DELETE", `/cart/${cheap2}`, undefined, mt.token);
await fillCart(mt.token, [[p1999, 3]]);
cart = await api("GET", "/cart", undefined, mt.token);
assert.equal(cart.body.total, 59.97); assert.equal(cart.body.items[0].subtotal, 59.97);
await api("DELETE", `/cart/${p1999}`, undefined, mt.token);
// input validation
assert.equal((await api("POST", "/cart", { productId: "x", quantity: 1 }, mt.token)).status, 400);
assert.equal((await api("POST", "/cart", { productId: cheap1, quantity: 0 }, mt.token)).status, 400);
assert.equal((await api("POST", "/cart", { productId: cheap1, quantity: 1.5 }, mt.token)).status, 400);
assert.equal((await api("POST", "/cart", { productId: 99999, quantity: 1 }, mt.token)).status, 404);
ok("cart totals exact (0.10+0.20 = 0.30, 3 x 19.99 = 59.97); cart input validated");
// wallet-only purchase of the 0.10 + 0.20 cart leaves exactly 0.00
await fillCart(mt.token, [[cheap1, 1], [cheap2, 1]]);
await setWallet(mt.id, "0.30");
x = await api("POST", "/payment/create-order", { address: "1 Test Road", useWallet: true }, mt.token);
assert.equal(x.status, 200, JSON.stringify(x.body)); assert.equal(x.body.paidByWallet, true);
assert.equal((await wallet(mt.id)).b, "0.00");
assert.equal((await q("select total::text t from orders where id=$1", [x.body.orderId]))[0].t, "0.30");
ok("paying 0.10 + 0.20 from a 0.30 wallet leaves exactly 0.00");

// =====================================================================================
section("C7 purchases with wallet money");
const pA = await makeProduct("Doll A", "400.00", 10);
const pB = await makeProduct("Doll B", "1000.00", 10);
const buyer = await signup(phoneN(), "Buyer", "buyerpass");
const addr = { address: "12 Festival Lane, Chennai" };

// (a) wallet covers everything, balance left over
await setWallet(buyer.id, "1000.00");
await fillCart(buyer.token, [[pA, 1]]);
sent.length = 0;
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
assert.equal(x.status, 200, JSON.stringify(x.body));
assert.deepEqual([x.body.paidByWallet, x.body.walletUsed, x.body.onlineAmount, x.body.total], [true, 400, 0, 400]);
assert.equal((await wallet(buyer.id)).b, "600.00");
let ord = (await q("select status, payment_status, wallet_amount::text w, payment_method m, razorpay_order_id r from orders where id=$1", [x.body.orderId]))[0];
assert.deepEqual([ord.status, ord.payment_status, ord.w, ord.m, ord.r], ["confirmed", "paid", "400.00", "wallet", null]);
assert.equal(await stockOf(pA), 9);
assert.equal((await api("GET", "/cart", undefined, buyer.token)).body.items.length, 0);
assert.equal((await q("select count(*)::int c from transactions where user_id=$1 and type='debit' and amount=400 and description like $2", [buyer.id, `Order #${x.body.orderId} (paid from wallet)%`]))[0].c, 1);
await tick();
assert.ok(waMessages(buyer.phone).some((m) => m.includes("Order Confirmed")));
const myOrders = await api("GET", "/orders", undefined, buyer.token);
assert.equal(myOrders.body[0].walletAmount, 400); assert.equal(myOrders.body[0].onlineAmount, 0);
ok("(a) wallet covers the order: confirmed instantly, wallet 1000 -> 600, stock -1, cart cleared, WhatsApp sent");

// (k) exact balance
await setWallet(buyer.id, "400.00");
await fillCart(buyer.token, [[pA, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
assert.equal(x.body.paidByWallet, true); assert.equal((await wallet(buyer.id)).b, "0.00");
ok("(k) balance exactly equal to the total -> wallet 0.00");

// (b) wallet short: wallet part + online part
await setWallet(buyer.id, "300.00");
await fillCart(buyer.token, [[pB, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
assert.equal(x.status, 200, JSON.stringify(x.body));
assert.deepEqual([x.body.paidByWallet, x.body.walletUsed, x.body.onlineAmount, x.body.amount], [false, 300, 700, 70000]);
assert.equal((await wallet(buyer.id)).b, "0.00");
const dbOrderB = x.body.dbOrderId; const rzB = x.body.razorpayOrderId;
ord = (await q("select status, payment_status, wallet_amount::text w, payment_method m from orders where id=$1", [dbOrderB]))[0];
assert.deepEqual([ord.status, ord.payment_status, ord.w, ord.m], ["pending", "pending", "300.00", "wallet+razorpay"]);
assert.equal(await stockOf(pB), 10); assert.equal(await reservedOf(pB), 1);
assert.equal((await q("select stock_reserved from orders where id=$1", [dbOrderB]))[0].stock_reserved, true);
assert.equal((await api("GET", "/orders", undefined, buyer.token)).body.every((o: any) => o.id !== dbOrderB), true);
ok("(b) wallet short: 300 held, 700 to pay online, order pending, not listed as a purchase yet");
// bad verifications
let pay = gatewayPay(rzB, 70000);
x = await api("POST", "/payment/verify-order", { ...pay, razorpaySignature: "0".repeat(64), dbOrderId: dbOrderB }, buyer.token); assert.equal(x.status, 400);
const other = await signup(phoneN(), "Other", "otherpass");
x = await api("POST", "/payment/verify-order", { ...pay, dbOrderId: dbOrderB }, other.token); assert.equal(x.status, 404);
ok("verify with bad signature / someone else's order is refused");
sent.length = 0;
x = await api("POST", "/payment/verify-order", { ...pay, dbOrderId: dbOrderB }, buyer.token);
assert.equal(x.status, 200, JSON.stringify(x.body)); assert.equal(x.body.success, true);
ord = (await q("select status, payment_status from orders where id=$1", [dbOrderB]))[0];
assert.deepEqual([ord.status, ord.payment_status], ["confirmed", "paid"]);
assert.equal(await stockOf(pB), 9); assert.equal(await reservedOf(pB), 0);
assert.equal((await q("select stock_reserved from orders where id=$1", [dbOrderB]))[0].stock_reserved, false);
assert.equal((await wallet(buyer.id)).b, "0.00");
assert.equal((await api("GET", "/cart", undefined, buyer.token)).body.items.length, 0);
let tx = await q("select type, amount::text a, razorpay_payment_id p from transactions where user_id=$1 and description like $2 order by id", [buyer.id, `Order #${dbOrderB}%`]);
assert.deepEqual(tx.map((t: any) => [t.type, t.a, !!t.p]), [["debit", "300.00", false], ["debit", "700.00", true]]);
await tick(); assert.ok(waMessages(buyer.phone).some((m) => m.includes("Order Confirmed")));
// verify again: idempotent
x = await api("POST", "/payment/verify-order", { ...pay, dbOrderId: dbOrderB }, buyer.token); assert.equal(x.status, 200);
assert.equal(await stockOf(pB), 9); assert.equal(await reservedOf(pB), 0);
assert.equal((await q("select count(*)::int c from transactions where description like $1", [`Order #${dbOrderB}%`]))[0].c, 2);
ok("(b) paid online -> confirmed, stock -1, 300 + 700 recorded, repeat verify changes nothing");

// (c) don't use the wallet
await setWallet(buyer.id, "5000.00");
await fillCart(buyer.token, [[pA, 1]]);
x = await api("POST", "/payment/create-order", { ...addr }, buyer.token);
assert.deepEqual([x.body.paidByWallet, x.body.walletUsed, x.body.onlineAmount, x.body.amount], [false, 0, 400, 40000]);
assert.equal((await wallet(buyer.id)).b, "5000.00");
pay = gatewayPay(x.body.razorpayOrderId);
assert.equal((await api("POST", "/payment/verify-order", { ...pay, dbOrderId: x.body.dbOrderId }, buyer.token)).status, 200);
assert.equal((await wallet(buyer.id)).b, "5000.00");
assert.equal((await q("select wallet_amount::text w, payment_method m from orders where id=$1", [x.body.dbOrderId]))[0].m, "razorpay");
ok("(c) wallet not used when the customer doesn't choose it");

// (d) chit-locked money is never spent
await setWallet(buyer.id, "0.00", "5000.00");
await fillCart(buyer.token, [[pA, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
assert.deepEqual([x.body.paidByWallet, x.body.walletUsed, x.body.onlineAmount], [false, 0, 400]);
assert.deepEqual(await wallet(buyer.id), { b: "0.00", l: "5000.00" });
await api("POST", "/payment/cancel-order", { dbOrderId: x.body.dbOrderId }, buyer.token);
await q("delete from cart_items where user_id=$1", [buyer.id]);
ok("(d) money locked in a chit plan is not spendable");

// (e) abandoned checkout is cancelled and the held money comes back
await setWallet(buyer.id, "300.00");
await fillCart(buyer.token, [[pB, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
assert.equal((await wallet(buyer.id)).b, "0.00");
const abandoned = x.body.dbOrderId;
let c = await api("POST", "/payment/cancel-order", { dbOrderId: abandoned }, buyer.token);
assert.equal(c.status, 200);
assert.equal((await wallet(buyer.id)).b, "300.00");
ord = (await q("select status, payment_status from orders where id=$1", [abandoned]))[0];
assert.deepEqual([ord.status, ord.payment_status], ["cancelled", "cancelled"]);
assert.equal(await reservedOf(pB), 0, "cancel unfreezes the stock");
c = await api("POST", "/payment/cancel-order", { dbOrderId: abandoned }, buyer.token);
assert.equal(c.body.alreadyCancelled, true); assert.equal((await wallet(buyer.id)).b, "300.00");
assert.equal((await api("GET", "/cart", undefined, buyer.token)).body.items.length, 1);
assert.equal((await q("select count(*)::int c from transactions where user_id=$1 and type='credit' and description like $2", [buyer.id, `Refund%Order #${abandoned}%`]))[0].c, 1);
assert.equal((await api("POST", "/payment/cancel-order", { dbOrderId: abandoned }, other.token)).status, 404);
ok("(e) cancel gives wallet money back once, cart kept, other customers can't cancel it");

// cancel is refused if the customer already paid online
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
const paidDb = x.body.dbOrderId; pay = gatewayPay(x.body.razorpayOrderId);
c = await api("POST", "/payment/cancel-order", { dbOrderId: paidDb }, buyer.token);
assert.equal(c.status, 409);
assert.equal((await api("POST", "/payment/verify-order", { ...pay, dbOrderId: paidDb }, buyer.token)).status, 200);
assert.equal((await api("POST", "/payment/cancel-order", { dbOrderId: paidDb }, buyer.token)).status, 409);
ok("cancel refused once the money has been taken or the order is paid");

// (f) timeout sweeper
await setWallet(buyer.id, "300.00");
await fillCart(buyer.token, [[pB, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
const stale = x.body.dbOrderId;
let sw = await sweepExpiredCheckouts(razorpay as any);
assert.equal(sw.released, 0); // not old enough yet
await q("update orders set created_at = now() - interval '40 minutes' where id=$1", [stale]);
sw = await sweepExpiredCheckouts(razorpay as any);
assert.equal(sw.released, 1);
assert.equal((await wallet(buyer.id)).b, "300.00");
assert.equal((await q("select status from orders where id=$1", [stale]))[0].status, "cancelled");
assert.equal(await reservedOf(pB), 0, "sweeper unfreezes the stock");
sw = await sweepExpiredCheckouts(razorpay as any); assert.equal(sw.released, 0);
await assertStockInvariant("after sweeper");
ok("(f) unpaid wallet checkout older than 30 min is cancelled and refunded by the sweeper (once)");
// the customer paid but the app never reported it
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
const unreported = x.body.dbOrderId; gatewayPay(x.body.razorpayOrderId);
await q("update orders set created_at = now() - interval '40 minutes' where id=$1", [unreported]);
sw = await sweepExpiredCheckouts(razorpay as any);
assert.equal(sw.confirmed, 1); assert.equal(sw.released, 0);
ord = (await q("select status, payment_status from orders where id=$1", [unreported]))[0];
assert.deepEqual([ord.status, ord.payment_status], ["confirmed", "paid"]);
assert.equal((await wallet(buyer.id)).b, "0.00");
ok("(f) paid-but-unreported checkout is confirmed by the sweeper, not cancelled");

// (g) paid after the checkout expired -> refunded
await setWallet(buyer.id, "300.00");
await fillCart(buyer.token, [[pB, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
const lateDb = x.body.dbOrderId; const lateRz = x.body.razorpayOrderId;
await api("POST", "/payment/cancel-order", { dbOrderId: lateDb }, buyer.token);
const stockBeforeLate = await stockOf(pB);
pay = gatewayPay(lateRz); refunds.length = 0;
x = await api("POST", "/payment/verify-order", { ...pay, dbOrderId: lateDb }, buyer.token);
assert.equal(x.status, 409); assert.equal(x.body.code, "ORDER_EXPIRED");
assert.equal(refunds.length, 1); assert.equal(refunds[0].id, pay.razorpayPaymentId); assert.equal(refunds[0].amount, 70000);
assert.equal((await wallet(buyer.id)).b, "300.00"); assert.equal(await stockOf(pB), stockBeforeLate); assert.equal(await reservedOf(pB), 0);
ok("(g) payment arriving after cancellation is refunded automatically; no order, stock untouched");
await q("delete from cart_items where user_id=$1", [buyer.id]);

// (h) stock the admin edits while customers are paying
await setWallet(buyer.id, "300.00");
await fillCart(buyer.token, [[pB, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
const heldDb = x.body.dbOrderId; const pBStock = await stockOf(pB); assert.equal(await reservedOf(pB), 1);
x = await api("PUT", `/admin/products/${pB}`, { stock: 0 }, adminToken);
assert.equal(x.status, 409); assert.equal(x.body.code, "STOCK_HELD"); assert.equal(await stockOf(pB), pBStock);
assert.equal((await api("DELETE", `/admin/products/${pB}`, undefined, adminToken)).status, 409);
x = await api("PUT", `/admin/products/${pB}`, { stock: 1 }, adminToken); assert.equal(x.status, 200); assert.equal(await stockOf(pB), 1);
await assert.rejects(q("update products set stock = 0 where id=$1", [pB]), /products_reserved_within_stock/);
const adminView = (await api("GET", "/admin/products?pageSize=100", undefined, adminToken)).body.items.find((p3: any) => p3.id === pB);
assert.deepEqual([adminView.stock, adminView.reservedStock, adminView.availableStock], [1, 1, 0]);
assert.equal((await api("PUT", `/admin/products/${pB}`, { stock: -3 }, adminToken)).status, 400);
assert.equal((await api("PUT", `/admin/products/${pB}`, { stock: 2.5 }, adminToken)).status, 400);
await api("POST", "/payment/cancel-order", { dbOrderId: heldDb }, buyer.token);
assert.equal(await reservedOf(pB), 0);
await api("PUT", `/admin/products/${pB}`, { stock: pBStock }, adminToken);
ok("(h) admin cannot set stock below held units (409), the database refuses it too; delete blocked while held");

// wallet-only checkout when the item is gone
await setWallet(buyer.id, "5000.00");
await api("PUT", `/admin/products/${pB}`, { stock: 0 }, adminToken);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
assert.equal(x.status, 409); assert.equal(x.body.code, "OUT_OF_STOCK"); assert.match(x.body.error, /ran out of stock/);
assert.deepEqual([x.body.items[0].productId, x.body.items[0].available, x.body.items[0].requested], [pB, 0, 1]);
assert.equal((await wallet(buyer.id)).b, "5000.00");
await api("PUT", `/admin/products/${pB}`, { stock: pBStock }, adminToken);
await q("delete from cart_items where user_id=$1", [buyer.id]);
ok("(h) checkout for a sold-out item is refused before payment, wallet untouched");
await assertStockInvariant("after section h");

// (l) remainder below one rupee
await setWallet(buyer.id, "999.50");
await fillCart(buyer.token, [[pB, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
assert.deepEqual([x.body.walletUsed, x.body.onlineAmount, x.body.amount], [999, 1, 100]);
assert.equal((await wallet(buyer.id)).b, "0.50");
await api("POST", "/payment/cancel-order", { dbOrderId: x.body.dbOrderId }, buyer.token);
assert.equal((await wallet(buyer.id)).b, "999.50");
ok("(l) online part never drops below Rs 1 (wallet pays 999, online pays 1)");
await q("delete from cart_items where user_id=$1", [buyer.id]);

// (n) two checkouts at once, wallet only enough for one
await setWallet(buyer.id, "400.00");
await fillCart(buyer.token, [[pA, 1]]);
const walletOrdersBefore = (await q("select count(*)::int c from orders where user_id=$1 and payment_status='paid' and payment_method='wallet'", [buyer.id]))[0].c;
const par = await Promise.all([0, 1].map(() => api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token)));
assert.equal(par.filter((p) => p.status === 200 && p.body.paidByWallet === true).length, 1, JSON.stringify(par.map((p) => [p.status, p.body.paidByWallet])));
assert.equal((await wallet(buyer.id)).b, "0.00");
assert.equal((await q("select count(*)::int c from orders where user_id=$1 and payment_status='paid' and payment_method='wallet'", [buyer.id]))[0].c, walletOrdersBefore + 1);
ok("(n) two simultaneous wallet checkouts: exactly one succeeds, wallet never goes negative");

// (o) webhook finishes a shop order even if the app is closed
await setWallet(buyer.id, "300.00");
await fillCart(buyer.token, [[pB, 1]]);
x = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, buyer.token);
const whDb = x.body.dbOrderId; pay = gatewayPay(x.body.razorpayOrderId);
const hookRaw = async (raw: string, signature: string) => {
  const r = await rawRequest("POST", "/payment/razorpay-webhook", { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(raw)), "x-razorpay-signature": signature }, raw);
  return { status: r.status, body: JSON.parse(r.text) };
};
const hook = (paymentId: string, orderId: string) => {
  const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
  return hookRaw(raw, crypto.createHmac("sha256", "whsec").update(raw).digest("hex"));
};
let h = await hook(pay.razorpayPaymentId, pay.razorpayOrderId);
assert.equal(h.status, 200);
assert.equal((await q("select status, payment_status from orders where id=$1", [whDb]))[0].payment_status, "paid");
const stockAfterHook = await stockOf(pB);
h = await hook(pay.razorpayPaymentId, pay.razorpayOrderId); assert.equal(h.status, 200);
x = await api("POST", "/payment/verify-order", { ...pay, dbOrderId: whDb }, buyer.token); assert.equal(x.status, 200);
assert.equal(await stockOf(pB), stockAfterHook);
assert.equal((await q("select count(*)::int c from transactions where razorpay_payment_id=$1", [pay.razorpayPaymentId]))[0].c, 1);
ok("(o) webhook confirms an order when the app is closed; webhook + app verify together change nothing twice");
// webhook signature
const badRaw = "{}";
const bw = await hookRaw(badRaw, "0".repeat(64));
assert.equal(bw.status, 400);

// (p) wallet top-up
x = await api("POST", "/payment/create-wallet-payment", { amount: 0 }, buyer.token); assert.equal(x.status, 400);
x = await api("POST", "/payment/create-wallet-payment", { amount: 0.5 }, buyer.token); assert.equal(x.status, 400);
x = await api("POST", "/payment/create-wallet-payment", { amount: 19.999 }, buyer.token); assert.equal(x.status, 400);
x = await api("POST", "/payment/create-wallet-payment", { amount: 50001 }, buyer.token); assert.equal(x.status, 400);
x = await api("POST", "/payment/create-wallet-payment", { amount: "abc" }, buyer.token); assert.equal(x.status, 400);
await setWallet(buyer.id, "10.00");
x = await api("POST", "/payment/create-wallet-payment", { amount: 250.5 }, buyer.token);
assert.equal(x.status, 200); assert.equal(x.body.amount, 25050);
pay = gatewayPay(x.body.razorpayOrderId);
assert.equal((await api("POST", "/payment/verify-wallet-payment", pay, buyer.token)).status, 200);
assert.equal((await wallet(buyer.id)).b, "260.50");
assert.equal((await api("POST", "/payment/verify-wallet-payment", pay, buyer.token)).status, 200);
h = await hook(pay.razorpayPaymentId, pay.razorpayOrderId); assert.equal(h.status, 200);
assert.equal((await wallet(buyer.id)).b, "260.50");
assert.equal((await api("POST", "/payment/verify-wallet-payment", pay, other.token)).status, 400); // someone else's payment
ok("(p) wallet top-up: amounts validated, credited exactly once across app verify + webhook");


// =====================================================================================
section("H2 stock reservation (freeze at checkout, sell on payment)");
{
  const pZ = await makeProduct("Scarce Doll", "100.00", 3);
  const uA = await signup(phoneN(), "Alpha"), uB = await signup(phoneN(), "Bravo"), uC = await signup(phoneN(), "Charlie");

  // A starts to pay for 2 of the 3
  await fillCart(uA.token, [[pZ, 2]]);
  let o = await api("POST", "/payment/create-order", { ...addr }, uA.token);
  assert.equal(o.status, 200, JSON.stringify(o.body));
  const aOrder = o.body;
  assert.equal(await reservedOf(pZ), 2); assert.equal(await stockOf(pZ), 3);
  let prod = await api("GET", `/products/${pZ}`);
  assert.equal(prod.body.stock, 1, "customers see what is still buyable"); assert.ok(!("reservedStock" in prod.body));
  assert.equal((await api("GET", "/products")).body.find((p3: any) => p3.id === pZ).stock, 1);
  ok("A's checkout freezes 2 of 3; the catalogue shows 1 left");

  // B wants 2 but only 1 is free: refused BEFORE any payment step
  await fillCart(uB.token, [[pZ, 2]]);
  const rzCount = rzOrders.size;
  o = await api("POST", "/payment/create-order", { ...addr }, uB.token);
  assert.equal(o.status, 409); assert.equal(o.body.code, "OUT_OF_STOCK");
  assert.match(o.body.error, /Only 1 of Scarce Doll left/);
  assert.deepEqual([o.body.items[0].available, o.body.items[0].requested], [1, 2]);
  assert.equal(rzOrders.size, rzCount, "no payment order is created when stock is short");
  assert.equal((await q("select count(*)::int c from orders where user_id=$1", [uB.id]))[0].c, 0);
  assert.equal(await reservedOf(pZ), 2);
  assert.equal((await api("GET", "/cart", undefined, uB.token)).body.items[0].product.stock, 1, "cart shows the buyable quantity");
  ok("B asking for 2 is told 'Only 1 left', no order and no payment link created");

  // B takes the last one, C is turned away
  await api("PUT", `/cart/${pZ}`, { quantity: 1 }, uB.token);
  o = await api("POST", "/payment/create-order", { ...addr }, uB.token);
  assert.equal(o.status, 200); const bOrder = o.body;
  assert.equal(await reservedOf(pZ), 3);
  assert.equal((await api("GET", `/products/${pZ}`)).body.stock, 0);
  await fillCart(uC.token, [[pZ, 1]]);
  o = await api("POST", "/payment/create-order", { ...addr }, uC.token);
  assert.equal(o.status, 409); assert.match(o.body.error, /Scarce Doll ran out of stock/);
  await assertStockInvariant("three buyers");
  ok("B freezes the last unit; C is told the item ran out of stock");

  // A pays: stock is sold, B still holds one
  let payA = gatewayPay(aOrder.razorpayOrderId);
  assert.equal((await api("POST", "/payment/verify-order", { ...payA, dbOrderId: aOrder.dbOrderId }, uA.token)).status, 200);
  assert.deepEqual([await stockOf(pZ), await reservedOf(pZ)], [1, 1]);
  // B walks away: the unit becomes available to C
  await api("POST", "/payment/cancel-order", { dbOrderId: bOrder.dbOrderId }, uB.token);
  assert.deepEqual([await stockOf(pZ), await reservedOf(pZ)], [1, 0]);
  o = await api("POST", "/payment/create-order", { ...addr }, uC.token);
  assert.equal(o.status, 200);
  const payC = gatewayPay(o.body.razorpayOrderId);
  assert.equal((await api("POST", "/payment/verify-order", { ...payC, dbOrderId: o.body.dbOrderId }, uC.token)).status, 200);
  assert.deepEqual([await stockOf(pZ), await reservedOf(pZ)], [0, 0]);
  await assertStockInvariant("after all paid");
  ok("A pays (stock 3→1), B abandons (unit freed), C buys it (stock 0, nothing frozen)");
}

{
  // 8 customers race for the last 5 units
  const pY = await makeProduct("Rush Doll", "50.00", 5);
  const rushers = [];
  for (let i = 0; i < 8; i++) { const u = await signup(phoneN(), "Rush" + i); await fillCart(u.token, [[pY, 1]]); rushers.push(u); }
  const results = await Promise.all(rushers.map((u) => api("POST", "/payment/create-order", { ...addr }, u.token)));
  const won = results.filter((r2) => r2.status === 200), lost = results.filter((r2) => r2.status === 409);
  assert.equal(won.length, 5, JSON.stringify(results.map((r2) => r2.status)));
  assert.equal(lost.length, 3); assert.ok(lost.every((l) => l.body.code === "OUT_OF_STOCK"));
  assert.equal(await reservedOf(pY), 5); assert.equal(await stockOf(pY), 5);
  assert.equal((await q("select count(*)::int c from orders where status='pending' and items @> $1::jsonb", [JSON.stringify([{ productId: pY }])]))[0].c, 5);
  await assertStockInvariant("rush");
  for (let i = 0; i < 8; i++) {
    const r2 = results[i];
    if (r2.status !== 200) continue;
    const pr = gatewayPay(r2.body.razorpayOrderId);
    assert.equal((await api("POST", "/payment/verify-order", { ...pr, dbOrderId: r2.body.dbOrderId }, rushers[i].token)).status, 200);
  }
  assert.deepEqual([await stockOf(pY), await reservedOf(pY)], [0, 0]);
  ok("8 customers racing for 5 units: exactly 5 get through, 3 are refused, never oversold");

  // many users, many products, opposite orders: no deadlock, no lost updates
  const m1 = await makeProduct("Mix One", "10.00", 30), m2 = await makeProduct("Mix Two", "10.00", 30);
  const mixers = [];
  for (let i = 0; i < 8; i++) {
    const u = await signup(phoneN(), "Mix" + i);
    await fillCart(u.token, i % 2 ? [[m1, 2], [m2, 3]] : [[m2, 3], [m1, 2]]);
    mixers.push(u);
  }
  const mixed = await Promise.all(mixers.map((u) => api("POST", "/payment/create-order", { ...addr }, u.token)));
  assert.ok(mixed.every((m) => m.status === 200), JSON.stringify(mixed.map((m) => [m.status, m.body.error])));
  assert.equal(await reservedOf(m1), 16); assert.equal(await reservedOf(m2), 24);
  await assertStockInvariant("mixed carts");
  for (let i = 0; i < mixers.length; i++) await api("POST", "/payment/cancel-order", { dbOrderId: mixed[i].body.dbOrderId }, mixers[i].token);
  assert.equal(await reservedOf(m1), 0); assert.equal(await reservedOf(m2), 0);
  await assertStockInvariant("mixed carts cancelled");
  ok("8 simultaneous checkouts with the same two products in opposite order: no deadlock, exact counts, all released again");

  // one short item refuses the whole checkout and freezes nothing
  const pS = await makeProduct("Plenty", "10.00", 10), pT = await makeProduct("Few", "10.00", 1);
  const sh = await signup(phoneN(), "Shorty");
  await fillCart(sh.token, [[pS, 1], [pT, 5]]);
  const shr = await api("POST", "/payment/create-order", { ...addr }, sh.token);
  assert.equal(shr.status, 409); assert.equal(shr.body.items.length, 1); assert.equal(shr.body.items[0].productId, pT);
  assert.equal(await reservedOf(pS), 0); assert.equal(await reservedOf(pT), 0);
  await fillCart(sh.token, [[pT, 0]].length ? [] : []);
  ok("a cart with one short item freezes nothing (all or nothing) and names the short item");

  // wallet-only buyers respect other people's frozen stock
  const pW = await makeProduct("Wallet Doll", "100.00", 2);
  const hA = await signup(phoneN(), "Holder"), wB = await signup(phoneN(), "Walleted");
  await fillCart(hA.token, [[pW, 2]]);
  const hold = await api("POST", "/payment/create-order", { ...addr }, hA.token); assert.equal(hold.status, 200);
  await setWallet(wB.id, "1000.00");
  await fillCart(wB.token, [[pW, 1]]);
  let wr = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, wB.token);
  assert.equal(wr.status, 409); assert.equal((await wallet(wB.id)).b, "1000.00");
  await api("POST", "/payment/cancel-order", { dbOrderId: hold.body.dbOrderId }, hA.token);
  wr = await api("POST", "/payment/create-order", { ...addr, useWallet: true }, wB.token);
  assert.equal(wr.status, 200); assert.equal(wr.body.paidByWallet, true);
  assert.deepEqual([await stockOf(pW), await reservedOf(pW)], [1, 0]);
  ok("a wallet-only order cannot take units that another customer is paying for; it works once they are freed");

  // unlisted by the admin after it was put in the cart
  const pU = await makeProduct("Soon hidden", "10.00", 5);
  const hid = await signup(phoneN(), "Hidden");
  await fillCart(hid.token, [[pU, 1]]);
  await api("PATCH", `/admin/products/${pU}/toggle-listing`, undefined, adminToken);
  assert.equal((await api("POST", "/payment/create-order", { ...addr }, hid.token)).status, 409);
  assert.equal(await reservedOf(pU), 0);
  ok("a product hidden by the admin cannot be checked out");

  // checkout that is never paid expires: stock comes back, a late payment is refunded
  const pV = await makeProduct("Expiring", "100.00", 3);
  const ex = await signup(phoneN(), "Expirer");
  await fillCart(ex.token, [[pV, 1]]);
  const exo = await api("POST", "/payment/create-order", { ...addr }, ex.token);
  assert.equal(await reservedOf(pV), 1);
  await sweepExpiredCheckouts(razorpay as any); assert.equal(await reservedOf(pV), 1, "not old enough yet");
  await q("update orders set created_at = now() - interval '40 minutes' where id=$1", [exo.body.dbOrderId]);
  const swp = await sweepExpiredCheckouts(razorpay as any);
  assert.equal(swp.released, 1); assert.equal(await reservedOf(pV), 0); assert.equal(await stockOf(pV), 3);
  const latePay = gatewayPay(exo.body.razorpayOrderId); refunds.length = 0;
  const late = await api("POST", "/payment/verify-order", { ...latePay, dbOrderId: exo.body.dbOrderId }, ex.token);
  assert.equal(late.status, 409); assert.equal(late.body.code, "ORDER_EXPIRED"); assert.equal(refunds.length, 1);
  assert.deepEqual([await stockOf(pV), await reservedOf(pV)], [3, 0]);
  await assertStockInvariant("expired");
  ok("an unpaid online checkout is released after 30 min (stock back); paying late is refunded");
}

// =====================================================================================
section("H1 chit plan approval flow");
{
  const adminList = async (status = "under_review") => (await api("GET", `/admin/chit-plans?status=${status}`, undefined, adminToken)).body;
  const c1 = await signup(phoneN(), "Chitra");
  sent.length = 0;
  let cp = await api("POST", "/chits/enroll-custom", { chits: 4 }, c1.token);
  assert.equal(cp.status, 201, JSON.stringify(cp.body));
  const plan1 = cp.body;
  assert.equal(plan1.reviewStatus, "under_review"); assert.equal(plan1.isApproved, false); assert.equal(plan1.isRejected, false);
  assert.equal(plan1.outstanding, 0, "nothing is payable while under review");
  assert.equal(plan1.monthlyAmount, 2000); assert.equal(plan1.totalAmount, 22000); assert.equal(plan1.bonusPoints, 2200);
  const row1 = (await q("select * from chit_plans where id=$1", [plan1.id]))[0];
  assert.equal(row1.user_id, c1.id); assert.equal(row1.is_approved, false); assert.equal(row1.is_rejected, false); assert.equal(row1.status, "active");
  await tick(); assert.ok(waMessages(c1.phone).some((m) => m.includes("Chit Plan Received")));
  ok("a new plan is created 'under review' (is_approved=false, is_rejected=false), linked to the user, customer told");

  // cannot pay, is not reminded, is not 'active'
  let pr1 = await api("POST", "/payment/create-chit-payment", { chitPlanId: plan1.id }, c1.token);
  assert.equal(pr1.status, 400); assert.match(pr1.body.error, /under review/);
  const myPlans = await api("GET", "/chits/my", undefined, c1.token);
  assert.equal(myPlans.body.length, 1); assert.equal(myPlans.body[0].reviewStatus, "under_review");
  await assert.rejects(
    (async () => { const { applyChitPayment } = await import("../lib/chit-payments"); return applyChitPayment({ chitPlanId: plan1.id, userId: c1.id, razorpayPaymentId: "pay_early", amountPaise: 100 }); })(),
    (e: any) => e.status === 409,
  );
  assert.equal((await q("select count(*)::int c from transactions where razorpay_payment_id='pay_early'"))[0].c, 0);
  sent.length = 0;
  await sendChitReminders(new Date("2026-11-04T11:00:00+05:30"));
  assert.equal(waMessages(c1.phone).filter((m) => m.includes("Chit Payment Due")).length, 0, "no reminder for a plan that is not approved");
  ok("under-review plan: cannot be paid (API and payment service both refuse), not reminded");

  // admin sees it
  let queue = await adminList();
  const q1 = queue.plans.find((p3: any) => p3.id === plan1.id);
  assert.ok(q1); assert.equal(q1.customer.userId, c1.id); assert.equal(q1.customer.phone, c1.phone); assert.equal(q1.amountDueOnApproval, 2000);
  assert.ok(queue.counts.under_review >= 1);
  assert.equal((await api("GET", "/admin/chit-plans", undefined, c1.token)).status, 401);
  assert.equal((await api("GET", "/admin/chit-plans")).status, 401);
  assert.equal((await api("POST", `/admin/chit-plans/${plan1.id}/approve`, {}, c1.token)).status, 401);
  ok("admin review queue lists it with customer details and what is due on approval; customers cannot use it");

  // one plan per customer per year: duplicate and simultaneous requests
  cp = await api("POST", "/chits/enroll-custom", { chits: 2 }, c1.token);
  assert.equal(cp.status, 409); assert.equal(cp.body.code, "CHIT_PLAN_EXISTS");
  const c2 = await signup(phoneN(), "Parallel");
  const burst = await Promise.all([1, 2, 3, 4, 5].map((i) => api("POST", "/chits/enroll-custom", { chits: i }, c2.token)));
  assert.equal(burst.filter((b) => b.status === 201).length, 1, JSON.stringify(burst.map((b) => b.status)));
  assert.equal(burst.filter((b) => b.status === 409 && b.body.code === "CHIT_PLAN_EXISTS").length, 4);
  assert.equal((await q("select count(*)::int c from chit_plans where user_id=$1", [c2.id]))[0].c, 1);
  ok("second plan in the same year refused; 5 simultaneous requests: exactly 1 created, 4 told to retry/check");

  // database rules
  await assert.rejects(q("update chit_plans set is_approved=true, is_rejected=true where id=$1", [plan1.id]), /chit_plans_not_approved_and_rejected/);
  await assert.rejects(
    q(`insert into chit_plans (user_id, name, chits, monthly_amount, total_amount, bonus_points, cycle_start_year) values ($1,'dup',1,500,5500,550,$2)`, [c1.id, plan1.cycleStartYear]),
    /chit_plans_one_per_user_per_year/,
  );
  ok("the database itself refuses 'approved and rejected', and a second live plan for the same year");

  // approve (two admins at once)
  sent.length = 0;
  const both = await Promise.all([1, 2].map(() => api("POST", `/admin/chit-plans/${plan1.id}/approve`, {}, adminToken)));
  assert.deepEqual(both.map((b) => b.status).sort(), [200, 409], JSON.stringify(both.map((b) => b.body)));
  assert.equal(both.find((b) => b.status === 409)!.body.code, "ALREADY_REVIEWED");
  const approved = both.find((b) => b.status === 200)!.body;
  assert.equal(approved.isApproved, true); assert.equal(approved.isRejected, false); assert.equal(approved.reviewStatus, "active");
  assert.equal(approved.outstanding, 2000);
  const row1b = (await q("select * from chit_plans where id=$1", [plan1.id]))[0];
  assert.equal(row1b.is_approved, true); assert.equal(row1b.is_rejected, false); assert.equal(row1b.reviewed_by, adm.id); assert.ok(row1b.reviewed_at);
  await tick(); assert.ok(waMessages(c1.phone).some((m) => m.includes("Chit Plan Approved") && m.includes("2,000")));
  assert.equal(waMessages(c1.phone).filter((m) => m.includes("Chit Plan Approved")).length, 1, "customer told once");
  let rej = await api("POST", `/admin/chit-plans/${plan1.id}/reject`, { reason: "late" }, adminToken); assert.equal(rej.status, 409);
  ok("approve: two admins at once, one wins; flags updated; reviewer + time recorded; customer told once; cannot be rejected afterwards");

  // active list = approved, not rejected, not finished
  const active = await api("GET", "/admin/chit-plans/subscriptions", undefined, adminToken);
  assert.ok(active.body.plans.some((p3: any) => p3.id === plan1.id && p3.reviewStatus === "active"));
  assert.ok(!active.body.plans.some((p3: any) => p3.userId === c2.id), "plans under review are not in the active list");
  assert.equal((await adminList("approved")).plans.some((p3: any) => p3.id === plan1.id), true);
  assert.equal((await adminList("under_review")).plans.some((p3: any) => p3.id === plan1.id), false);
  ok("active list shows only approved plans; the review queue no longer shows it");

  // customer can now pay (partial then rest), as before
  pr1 = await api("POST", "/payment/create-chit-payment", { chitPlanId: plan1.id }, c1.token);
  assert.equal(pr1.status, 200, JSON.stringify(pr1.body)); assert.equal(pr1.body.amount, 200000);
  pay = gatewayPay(pr1.body.razorpayOrderId, 50000);
  x = await api("POST", "/payment/verify-chit-payment", pay, c1.token);
  assert.equal(x.status, 200); assert.equal(x.body.partial, true); assert.equal(x.body.outstanding, 1500);
  await tick(); assert.ok(waMessages(c1.phone).some((m) => m.includes("Not Completed in Full")));
  pr1 = await api("POST", "/payment/create-chit-payment", { chitPlanId: plan1.id }, c1.token);
  assert.equal(pr1.body.amount, 150000);
  pay = gatewayPay(pr1.body.razorpayOrderId);
  x = await api("POST", "/payment/verify-chit-payment", pay, c1.token);
  assert.equal(x.body.partial, false); assert.equal(x.body.outstanding, 0);
  assert.deepEqual(await wallet(c1.id), { b: "0.00", l: "2000.00" });
  assert.equal((await api("POST", "/payment/create-chit-payment", { chitPlanId: plan1.id }, c1.token)).status, 400);
  assert.equal((await api("POST", "/payment/create-chit-payment", { chitPlanId: plan1.id }, other.token)).status, 404);
  ok("after approval: partial payment flagged, rest paid, money locked in the wallet; strangers refused");

  // reject with a reason; customer can re-apply
  const c3 = await signup(phoneN(), "Rejectee");
  const plan3 = (await api("POST", "/chits/enroll-custom", { chits: 10 }, c3.token)).body;
  assert.equal((await api("POST", `/admin/chit-plans/${plan3.id}/reject`, { reason: "x".repeat(301) }, adminToken)).status, 400);
  assert.equal((await api("POST", `/admin/chit-plans/${plan3.id}/reject`, { reason: 42 }, adminToken)).status, 400);
  sent.length = 0;
  rej = await api("POST", `/admin/chit-plans/${plan3.id}/reject`, { reason: "Documents missing" }, adminToken);
  assert.equal(rej.status, 200); assert.equal(rej.body.isRejected, true); assert.equal(rej.body.isApproved, false); assert.equal(rej.body.reviewStatus, "rejected");
  const row3 = (await q("select * from chit_plans where id=$1", [plan3.id]))[0];
  assert.deepEqual([row3.is_approved, row3.is_rejected, row3.rejection_reason, row3.reviewed_by], [false, true, "Documents missing", adm.id]);
  await tick(); assert.ok(waMessages(c3.phone).some((m) => m.includes("Not Approved") && m.includes("Documents missing")));
  assert.equal((await api("POST", `/admin/chit-plans/${plan3.id}/approve`, {}, adminToken)).status, 409);
  assert.equal((await api("POST", `/admin/chit-plans/${plan3.id}/reject`, {}, adminToken)).status, 409);
  const mine3 = await api("GET", "/chits/my", undefined, c3.token);
  assert.equal(mine3.body[0].reviewStatus, "rejected"); assert.equal(mine3.body[0].rejectionReason, "Documents missing");
  assert.equal((await api("POST", "/payment/create-chit-payment", { chitPlanId: plan3.id }, c3.token)).status, 400);
  const again2 = await api("POST", "/chits/enroll-custom", { chits: 3 }, c3.token);
  assert.equal(again2.status, 201, "a rejected customer can submit a new plan");
  const mine3b = await api("GET", "/chits/my", undefined, c3.token);
  assert.deepEqual(mine3b.body.map((p3: any) => p3.reviewStatus), ["under_review", "rejected"]);
  assert.equal((await adminList("rejected")).plans.some((p3: any) => p3.id === plan3.id), true);
  assert.equal((await api("POST", "/admin/chit-plans/999999/approve", {}, adminToken)).status, 404);
  assert.equal((await api("POST", "/admin/chit-plans/abc/approve", {}, adminToken)).status, 400);
  ok("reject: reason saved and sent; cannot be approved/rejected again; customer sees it and can re-apply");

  // plan year over
  const c4 = await signup(phoneN(), "Late");
  const plan4 = (await api("POST", "/chits/enroll-custom", { chits: 1 }, c4.token)).body;
  await q("update chit_plans set cycle_start_year = 2024 where id=$1", [plan4.id]);
  const ended = await api("POST", `/admin/chit-plans/${plan4.id}/approve`, {}, adminToken);
  assert.equal(ended.status, 409); assert.match(ended.body.error, /year has ended/);
  assert.equal((await api("POST", `/admin/chit-plans/${plan4.id}/reject`, { reason: "Year over" }, adminToken)).status, 200);
  ok("a plan from a finished plan year cannot be approved (it can be rejected)");

  // customer deletes account while plan is under review
  const c5 = await signup(phoneN(), "Quitter", "quitpass1");
  const plan5 = (await api("POST", "/chits/enroll-custom", { chits: 1 }, c5.token)).body;
  assert.equal((await api("DELETE", "/auth/account", { password: "quitpass1" }, c5.token)).status, 200);
  assert.equal((await q("select status from chit_plans where id=$1", [plan5.id]))[0].status, "cancelled");
  assert.equal((await api("POST", `/admin/chit-plans/${plan5.id}/approve`, {}, adminToken)).status, 409);
  assert.equal((await adminList("all")).plans.some((p3: any) => p3.id === plan5.id), false);
  ok("deleting the account cancels a plan that is still under review (kept in the database, cannot be approved)");
}

// =====================================================================================
section("H5 reminders and notification tracking");
{
  const mkPlan = async (userId: string, chits: number, o: { approved?: boolean; paid?: string; cycle?: number } = {}) => {
    const monthly = chits * 500;
    const [pl] = await db.insert(s.chitPlansTable).values({
      userId, name: `${chits} chits`, chits, monthlyAmount: String(monthly), totalAmount: String(monthly * 11),
      bonusPoints: Math.round(monthly * 11 * 0.1), cycleStartYear: o.cycle ?? 2026, amountPaid: o.paid ?? "0",
      isApproved: o.approved ?? true,
    }).returning();
    return pl;
  };
  // keep only the given plans running, so each stage's numbers are exact
  const onlyActive = (...ids: number[]) =>
    q("update chit_plans set status='cancelled' where status='active' and id <> all($1)", [ids]);
  // fresh slate so the numbers are exact
  await q("delete from chit_reminder_log"); await q("delete from notification_log");
  await q("update chit_plans set status='cancelled' where status='active'");

  const rOwes = await signup(phoneN(), "Owes");          // approved, owes Oct+Nov (cycle 2026 on 4 Nov)
  const rPaid = await signup(phoneN(), "PaidUp");        // approved, paid up
  const rReview = await signup(phoneN(), "InReview");    // not approved: never reminded
  const rGhost = await signup(phoneN(), "Ghost");        // deleted account: never reminded
  const rBehind = await signup(phoneN(), "Behind");      // older plan year: many months behind
  const plOwes = await mkPlan(rOwes.id, 2);
  const plPaid = await mkPlan(rPaid.id, 2, { paid: "2000" });
  const plReview = await mkPlan(rReview.id, 2, { approved: false });
  const plGhost = await mkPlan(rGhost.id, 2);
  await q("update users set is_deleted = true where user_id=$1", [rGhost.id]);
  const plBehind = await mkPlan(rBehind.id, 4, { cycle: 2025, paid: "2000" });

  const nov4 = new Date("2026-11-04T11:00:00+05:30");
  sent.length = 0;
  let run = await sendChitReminders(nov4);
  assert.equal(run.sent, 2, "owes + behind are reminded; paid-up, under-review and deleted are not");
  assert.equal(run.failed, 0);
  const owesMsg = waMessages(rOwes.phone).find((m) => m.includes("Chit Payment Due"))!;
  assert.ok(owesMsg && owesMsg.includes("Total pending") && owesMsg.includes("ignore"));
  for (const u of [rPaid, rReview, rGhost]) assert.equal(waMessages(u.phone).length, 0);
  const logs = await q("select * from chit_reminder_log order by id");
  assert.equal(logs.length, 2);
  assert.ok(logs.every((l: any) => l.status === "sent" && l.attempts === 1 && l.kind === "day4" && l.period_key === "2026-11" && l.sent_at));
  const nlogs = await q("select * from notification_log where kind='chit_reminder_day4' order by id");
  assert.equal(nlogs.length, 2); assert.ok(nlogs.every((l: any) => l.status === "sent" && l.related_type === "chit_plan" && l.channel === "whatsapp"));
  assert.deepEqual(nlogs.map((l: any) => l.related_id).sort(), [plOwes.id, plBehind.id].sort());
  assert.equal(nlogs.find((l: any) => l.related_id === plOwes.id).user_id, rOwes.id);
  ok("4th: only approved plans that owe money are reminded; each reminder and notification is recorded");

  // no duplicates, even run at the same instant from two places
  const dup = await Promise.all([sendChitReminders(nov4), sendChitReminders(nov4)]);
  assert.equal(dup[0].sent + dup[1].sent, 0);
  assert.equal(sent.filter((m) => m.body.includes("Chit Payment Due")).length, 2);
  // 10th: only those still owing
  await db.update(s.chitPlansTable).set({ amountPaid: "1000" }).where(eq(s.chitPlansTable.id, plOwes.id)); // paid October only: still owes November
  run = await sendChitReminders(new Date("2026-11-10T11:00:00+05:30"));
  assert.equal(run.sent, 2);
  assert.equal((await q("select count(*)::int c from chit_reminder_log where kind='day10'"))[0].c, 2);
  await db.update(s.chitPlansTable).set({ amountPaid: "3000" }).where(eq(s.chitPlansTable.id, plOwes.id)); // paid up through December
  const dec10Before = sent.length;
  run = await sendChitReminders(new Date("2026-12-10T11:00:00+05:30"));
  assert.equal(sent.slice(dec10Before).filter((m) => m.to === `whatsapp:${rOwes.phone}`).length, 0, "paid customers are skipped");
  ok("no duplicate reminders (even from two simultaneous runs); the 10th reminds only those still owing");

  // failures are recorded and retried (max 3 tries)
  const rFail = await signup(phoneN(), "FailsToSend");
  const plFail = await mkPlan(rFail.id, 1);
  await onlyActive(plFail.id);
  const realF = globalThis.fetch;
  const failingTwilio = (async (url: any, init: any) => String(url).includes("api.twilio.com")
    ? new Response(JSON.stringify({ code: 21608 }), { status: 400 }) : realF(url, init)) as any;
  const jan4 = new Date("2027-01-04T11:00:00+05:30");
  globalThis.fetch = failingTwilio;
  run = await sendChitReminders(jan4); assert.deepEqual([run.sent, run.failed], [0, 1]);
  let fl = (await q("select * from chit_reminder_log where chit_plan_id=$1", [plFail.id]))[0];
  assert.deepEqual([fl.status, fl.attempts], ["failed", 1]); assert.ok(fl.last_error);
  const failedN = await q("select * from notification_log where related_id=$1 and kind='chit_reminder_day4'", [plFail.id]);
  assert.equal(failedN.length, 1); assert.equal(failedN[0].status, "failed"); assert.ok(failedN[0].error);
  run = await sendChitReminders(jan4); assert.equal(run.failed, 1);
  run = await sendChitReminders(jan4); assert.equal(run.failed, 1);
  fl = (await q("select * from chit_reminder_log where chit_plan_id=$1", [plFail.id]))[0];
  assert.deepEqual([fl.status, fl.attempts], ["failed", 3]);
  run = await sendChitReminders(jan4); assert.deepEqual([run.sent, run.failed], [0, 0]);
  assert.equal((await q("select attempts from chit_reminder_log where chit_plan_id=$1", [plFail.id]))[0].attempts, 3, "stops after 3 tries");
  globalThis.fetch = realF;
  ok("a failing reminder is logged as failed with the error, retried up to 3 times, then left for the admin");

  // a failed one that works on retry
  const rRetry = await signup(phoneN(), "RetryOk");
  const plRetry = await mkPlan(rRetry.id, 1);
  await onlyActive(plRetry.id);
  const feb4 = new Date("2027-02-04T11:00:00+05:30");
  globalThis.fetch = failingTwilio; run = await sendChitReminders(feb4); assert.equal(run.failed, 1);
  globalThis.fetch = realF; sent.length = 0;
  run = await sendChitReminders(feb4); assert.deepEqual([run.sent, run.failed], [1, 0]);
  fl = (await q("select * from chit_reminder_log where chit_plan_id=$1", [plRetry.id]))[0];
  assert.deepEqual([fl.status, fl.attempts], ["sent", 2]); assert.equal(fl.last_error, null); assert.ok(fl.sent_at);
  ok("a reminder that failed once and succeeds on retry ends up 'sent' with attempts = 2");

  // a sender that died mid-way: its stale claim is taken over; a live in-flight claim is left alone
  const rStale = await signup(phoneN(), "StaleClaim"), rFresh = await signup(phoneN(), "FreshClaim");
  const plStale = await mkPlan(rStale.id, 1), plFresh = await mkPlan(rFresh.id, 1);
  await onlyActive(plStale.id, plFresh.id);
  await q(`insert into chit_reminder_log (chit_plan_id, kind, period_key, status, attempts, updated_at)
           values ($1,'day4','2027-03','pending',1, now() - interval '30 minutes')`, [plStale.id]);
  await q(`insert into chit_reminder_log (chit_plan_id, kind, period_key, status, attempts) values ($1,'day4','2027-03','pending',1)`, [plFresh.id]);
  sent.length = 0;
  run = await sendChitReminders(new Date("2027-03-04T11:00:00+05:30"));
  assert.equal(run.sent, 1);
  assert.equal((await q("select status from chit_reminder_log where chit_plan_id=$1", [plStale.id]))[0].status, "sent");
  assert.equal((await q("select status from chit_reminder_log where chit_plan_id=$1", [plFresh.id]))[0].status, "pending");
  assert.equal(waMessages(rFresh.phone).length, 0, "someone else is sending that one right now");
  ok("a dead sender's stale claim is taken over; a live in-flight claim is respected");

  // ---------- the admin dashboard
  await q("delete from chit_reminder_log"); await q("delete from notification_log");
  await q("update chit_plans set status='cancelled' where status='active'");
  const dOwes = await signup(phoneN(), "DashOwes"), dBehind = await signup(phoneN(), "DashBehind"), dPaid = await signup(phoneN(), "DashPaid"), dPart = await signup(phoneN(), "DashPartial"), dNew = await signup(phoneN(), "DashNew");
  const pl1 = await mkPlan(dOwes.id, 2);                                   // Oct: owes 1,000 (1 month)
  const pl2 = await mkPlan(dBehind.id, 4, { cycle: 2025, paid: "6000" });  // 2025 plan: 22,000 due, paid 6,000 => 8 months behind
  const pl3 = await mkPlan(dPaid.id, 2, { paid: "1000" });                 // paid up
  const pl4 = await mkPlan(dPart.id, 2, { paid: "400" });                  // part paid: owes 600
  const pl5 = await mkPlan(dNew.id, 1, { approved: false });               // waiting for approval
  const nowD = new Date();
  await q("insert into chit_reminder_log (chit_plan_id, kind, period_key, status, attempts, sent_at) values ($1,'day4',$2,'sent',1,now())", [pl1.id, `${nowD.getUTCFullYear()}-${String(nowD.getUTCMonth() + 1).padStart(2, "0")}`]);
  await q("insert into notification_log (user_id, phone, channel, kind, status, related_type, related_id) values ($1,$2,'whatsapp','chit_reminder_day4','sent','chit_plan',$3)", [dOwes.id, dOwes.phone, pl1.id]);
  await q("insert into notification_log (user_id, phone, channel, kind, status, error) values ($1,$2,'whatsapp','order_confirmed','failed','21608 not allowed')", [dOwes.id, dOwes.phone]);
  const heldBefore = (await q("select coalesce(sum(reserved_stock),0)::int s from products"))[0].s;
  const sp = await makeProduct("Almost gone", "10.00", 2);
  const dash = await api("GET", "/admin/ops", undefined, adminToken);
  assert.equal(dash.status, 200, JSON.stringify(dash.body).slice(0, 300));
  const D = dash.body;
  // after the 10th, anyone who still owes this month is late too; before it they are just pending
  const afterTenth = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDate() > 10;
  assert.equal(D.payments.activePlans, 4); assert.equal(D.payments.paidUp, 1);
  assert.equal(D.payments.late, afterTenth ? 3 : 1);
  assert.equal(D.payments.pending, afterTenth ? 0 : 2);
  assert.equal(D.payments.multiMonthPending, 1);
  assert.equal(D.payments.partiallyPaid, 1);
  assert.equal(D.payments.neverPaid, 1);                             // dOwes
  assert.equal(D.approvals.pending, 1);
  assert.deepEqual(D.pendingPayments.map((p3: any) => p3.customer.name.split(" ")[0]), ["DashBehind", "DashOwes", "DashPartial"]);
  assert.equal(D.pendingPayments[0].monthsPending, 8); assert.equal(D.pendingPayments[0].outstanding, 16000);
  assert.deepEqual(D.multiMonthPending.map((p3: any) => p3.customer.name.split(" ")[0]), ["DashBehind"]);
  assert.deepEqual(D.latePayments.map((p3: any) => p3.customer.name.split(" ")[0]), afterTenth ? ["DashBehind", "DashOwes", "DashPartial"] : ["DashBehind"]);
  const owesRow = D.pendingPayments.find((p3: any) => p3.chitPlanId === pl1.id);
  assert.equal(owesRow.outstanding, 1000); assert.equal(owesRow.remindersSent, 1); assert.ok(owesRow.lastReminderAt);
  assert.equal(D.reminders.sentThisMonth, 1); assert.equal(D.reminders.failedThisMonth, 0);
  assert.equal(D.reminders.byKind[0].kind, "day4"); assert.equal(D.reminders.byKind[0].sentThisMonth, 1);
  assert.equal(D.reminders.owingNeverReminded, 2);
  assert.ok(D.recentReminders.length >= 1 && D.recentReminders[0].customerName);
  assert.ok(D.notifications.sentLast24h >= 1); assert.equal(D.notifications.failedLast30d, 1);
  assert.ok(D.notifications.byKind.some((k: any) => k.kind === "chit_reminder_day4" && k.sent24h === 1));
  assert.equal(D.recentFailures.length, 1); assert.equal(D.recentFailures[0].kind, "order_confirmed"); assert.match(D.recentFailures[0].error, /21608/);
  assert.equal(D.payments.outstandingTotal, 16000 + 1000 + 600);
  assert.equal(D.payments.monthlyRunRate, 1000 + 2000 + 1000 + 1000);
  assert.ok(D.payments.collectionRate >= 0 && D.payments.collectionRate <= 100);
  assert.equal(D.checkouts.unitsHeld, heldBefore);
  assert.ok(D.lowStock.some((x2: any) => x2.id === sp && x2.available === 2));
  assert.ok(D.customers.total >= 5 && D.customers.closed >= 1);
  assert.ok(Array.isArray(D.collectionsByMonth) && D.collectionsByMonth.length >= 1);
  const collected = D.collectionsByMonth.reduce((a2: number, m: any) => a2 + m.total, 0);
  const expectedCollected = Number((await q("select coalesce(sum(amount),0)::numeric s from transactions where type='debit' and description like 'Chit payment%'"))[0].s);
  assert.equal(collected, expectedCollected);
  assert.equal((await api("GET", "/admin/ops", undefined, dOwes.token)).status, 401);
  assert.equal((await api("GET", "/admin/ops")).status, 401);
  ok("admin dashboard: late / pending / multi-month lists, reminder + notification counts, failures, approvals, collections, stock, wallets");
}

// =====================================================================================
section("OTP stored hashed, countries, 60-day inactivity");
{
  const hu = await signup(phoneN(), "Hashy");
  const otpRows = await q("select * from otp_verifications where phone=$1", [hu.phone]);
  assert.ok(otpRows.length >= 1);
  assert.ok(!("otp" in otpRows[0]), "no plain-text otp column");
  assert.match(otpRows[0].otp_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(otpRows[0].otp_hash, lastOtp(hu.phone), "the stored value is not the code");
  assert.equal(otpRows[0].otp_hash, hashOtp(hu.phone, "register", lastOtp(hu.phone)), "keyed hash bound to phone + purpose");
  assert.notEqual(hashOtp(hu.phone, "reset", "123456"), hashOtp(hu.phone, "register", "123456"));
  ok("one-time codes are stored as keyed hashes, bound to phone and purpose");

  // country codes: the app sends the full international number
  const us = "+14155552671";
  let r2 = await api("POST", "/auth/send-otp", { phone: us }); assert.equal(r2.status, 200, JSON.stringify(r2.body));
  r2 = await api("POST", "/auth/register", { fname: "Sam", phone: us, password: "secret123", otp: lastOtp(us) });
  assert.equal(r2.status, 201, JSON.stringify(r2.body)); assert.equal(r2.body.user.phone, us);
  r2 = await api("POST", "/auth/login", { phone: us, password: "secret123" }); assert.equal(r2.status, 200);
  const uae = "+971501234567";
  assert.equal((await api("POST", "/auth/send-otp", { phone: uae })).status, 200);
  for (const bad of ["+91 5876543210", "+9198765", "+1415555", "+0123456789012", "+1234567890123456", "++919876543210", "98765abc10"]) {
    assert.equal((await api("POST", "/auth/send-otp", { phone: bad })).status, 400, bad);
  }
  ok("any listed country works (+1, +971 ...), India keeps its 10-digit mobile rule, junk is refused");

  // inactivity
  await q("update users set last_active_at = now() - interval '61 days' where user_id=$1", [hu.id]);
  let inact = await api("GET", "/wallet", undefined, hu.token);
  assert.equal(inact.status, 401); assert.equal(inact.body.code, "SESSION_INACTIVE");
  await q("update users set last_active_at = now() - interval '59 days' where user_id=$1", [hu.id]);
  assert.equal((await api("GET", "/wallet", undefined, hu.token)).status, 200);
  const touched = (await q("select extract(epoch from now() - last_active_at) as secs from users where user_id=$1", [hu.id]))[0].secs;
  assert.ok(Number(touched) < 120, "using the app renews the 60 days");
  ok("signed out after 60 days without use; any use before that renews the session");
}

// =====================================================================================
section("pagination");
{
  for (let i = 0; i < 12; i++) assert.equal((await api("POST", "/admin/vendors", { name: `Vendor ${String(i).padStart(2, "0")}` }, adminToken)).status, 201);
  let pg = await api("GET", "/admin/vendors?pageSize=5&page=2", undefined, adminToken);
  assert.equal(pg.status, 200); assert.equal(pg.body.items.length, 5); assert.equal(pg.body.page, 2);
  assert.ok(pg.body.total >= 12); assert.equal(pg.body.totalPages, Math.ceil(pg.body.total / 5));
  const p1 = await api("GET", "/admin/vendors?pageSize=5&page=1", undefined, adminToken);
  assert.ok(!p1.body.items.some((v: any) => pg.body.items.some((w: any) => w.id === v.id)), "pages do not overlap");
  assert.equal((await api("GET", "/admin/vendors?pageSize=100000", undefined, adminToken)).body.pageSize, 100, "page size is capped");
  assert.equal((await api("GET", "/admin/vendors?page=abc&pageSize=-4", undefined, adminToken)).body.page, 1, "junk falls back to defaults");
  assert.equal((await api("GET", "/admin/vendors?q=Vendor%2007", undefined, adminToken)).body.total, 1, "search narrows the list");
  assert.equal((await api("GET", "/admin/vendors?q=%25", undefined, adminToken)).body.total, 0, "% is searched literally");
  assert.equal((await api("GET", "/admin/orders?pageSize=3", undefined, adminToken)).body.items.length <= 3, true);
  assert.equal((await api("GET", "/admin/wallets?pageSize=2", undefined, adminToken)).body.items.length <= 2, true);
  assert.equal((await api("GET", "/admin/orders?status=bogus", undefined, adminToken)).status, 400);

  // customer side
  const pgc = await signup(phoneN(), "Pager");
  for (let i = 0; i < 5; i++) await makeProduct(`Pager Doll ${i}`, "10.00", 3);
  const prodsA = await api("GET", "/products?pageSize=2&page=1"); const prodsB = await api("GET", "/products?pageSize=2&page=2");
  assert.equal(prodsA.body.length, 2); assert.equal(prodsB.body.length, 2);
  assert.ok(prodsA.body.every((a: any) => !prodsB.body.some((b: any) => b.id === a.id)));
  assert.ok((await api("GET", "/products?search=Pager%20Doll%203")).body.length === 1);
  for (let i = 0; i < 7; i++) await q("insert into transactions (user_id, type, amount, description) values ($1,'credit','1','t')", [pgc.id]);
  const w1 = await api("GET", "/wallet?pageSize=3", undefined, pgc.token);
  assert.equal(w1.body.transactions.length, 3); assert.equal(w1.body.hasMore, true);
  const w3 = await api("GET", "/wallet?pageSize=3&page=3", undefined, pgc.token);
  assert.equal(w3.body.transactions.length, 1); assert.equal(w3.body.hasMore, false);
  ok("lists are paged (admin: items/total/totalPages with search + filters; customer: page/pageSize), size capped, junk ignored");
}

// =====================================================================================
section("validation on admin routes");
{
  const bad = async (path: string, body: any, method = "POST") => {
    const r3 = await api(method, path, body, adminToken); assert.equal(r3.status, 400, `${method} ${path} ${JSON.stringify(body)} -> ${JSON.stringify(r3.body)}`); return r3.body.error as string;
  };
  await bad("/admin/products", { name: "", price: 10, category: "X" });
  await bad("/admin/products", { name: "N", price: 10 });
  await bad("/admin/products", { name: "N", price: 10, category: "X", stock: 1.5 });
  await bad("/admin/products", { name: "N", price: 10, category: "X", stock: -1 });
  await bad("/admin/products", { name: "N", price: 10, category: "X", imageUrl: "javascript:alert(1)" });
  await bad("/admin/products", { name: "N", price: 10, category: "X", tags: Array.from({ length: 20 }, (_, i) => "t" + i) });
  await bad("/admin/products", { name: "x".repeat(200), price: 10, category: "X" });
  await bad("/admin/products", { name: "N", price: 10, category: "X", isFeatured: "yes" });
  await bad("/admin/vendors", { name: "V", email: "not-an-email" });
  await bad("/admin/vendors", { name: "V", phone: "abc" });
  await bad("/admin/vendors", {});
  await bad("/admin/products/abc", {}, "PUT");
  await bad("/admin/orders/1/status", { status: "teleported" }, "PUT");
  await bad("/admin/orders/1/status", { status: "confirmed", paymentStatus: "paid" }, "PUT");
  const okP = await api("POST", "/admin/products", { name: " Trimmed ", price: "12.50", category: "Modern", tags: "a, b ,,c", stock: "4", imageUrl: "" }, adminToken);
  assert.equal(okP.status, 201, JSON.stringify(okP.body));
  assert.equal(okP.body.name, "Trimmed"); assert.deepEqual(okP.body.tags, ["a", "b", "c"]); assert.equal(okP.body.stock, 4); assert.equal(okP.body.imageUrl, null);
  const malformed = await rawRequest("POST", "/admin/vendors", { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, "{not json");
  assert.equal(malformed.status, 400);
  assert.equal((await api("PUT", `/admin/products/${okP.body.id}`, { rating: 9 }, adminToken)).status, 400);
  assert.equal((await api("POST", "/cart", { productId: 1.5, quantity: 1 }, (await signup(phoneN())).token)).status, 400);
  ok("admin product/vendor/order input is validated with clear messages; bad JSON and bad ids give 400, not 500");
}

// =====================================================================================
section("delivery addresses with full details + Google Maps link");
{
  const ad = await signup(phoneN(), "Addr");
  const good = { label: "Home", recipientName: "Asha Rao", phone: "9876543210", flatNumber: "12B", building: "Lotus Apartments", street: "MG Road", locality: "Indiranagar", landmark: "Metro station", city: "Bengaluru", state: "Karnataka", pincode: "560038", latitude: 12.9716, longitude: 77.5946 };
  for (const patch of [{ flatNumber: "" }, { locality: undefined }, { city: "" }, { pincode: "5600" }, { pincode: "ABCDEF" }, { phone: "123" }, { latitude: 95 }, { longitude: undefined }, { latitude: "12.9" }, { recipientName: "A" }]) {
    const r4 = await api("POST", "/addresses", { ...good, ...patch }, ad.token); assert.equal(r4.status, 400, JSON.stringify(patch) + JSON.stringify(r4.body));
  }
  const a1 = await api("POST", "/addresses", good, ad.token);
  assert.equal(a1.status, 201, JSON.stringify(a1.body));
  assert.equal(a1.body.address.isDefault, true);
  assert.equal(a1.body.address.formattedAddress, "12B, Lotus Apartments, MG Road, Indiranagar, Near Metro station, Bengaluru, Karnataka - 560038");
  assert.match(a1.body.address.addressLink, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=12\.971600,77\.594600$/);
  assert.equal(a1.body.address.phone, "+919876543210");
  let urow = (await q("select address, address_link from users where user_id=$1", [ad.id]))[0];
  assert.equal(urow.address, a1.body.address.formattedAddress); assert.equal(urow.address_link, a1.body.address.addressLink);
  const a2 = await api("POST", "/addresses", { ...good, label: "Work", flatNumber: "Floor 3", latitude: 13.0, longitude: 77.6, isDefault: true }, ad.token);
  assert.equal(a2.status, 201);
  urow = (await q("select address, address_link from users where user_id=$1", [ad.id]))[0];
  assert.equal(urow.address, a2.body.address.formattedAddress, "users.address follows the default address");
  assert.match(urow.address_link, /query=13\.000000,77\.600000/);
  const edit = await api("PUT", `/addresses/${a2.body.address.id}`, { ...good, label: "Work", flatNumber: "Floor 9", latitude: 13.1, longitude: 77.7 }, ad.token);
  assert.equal(edit.status, 200); assert.match(edit.body.address.formattedAddress, /^Floor 9,/);
  urow = (await q("select address, address_link from users where user_id=$1", [ad.id]))[0];
  assert.match(urow.address, /^Floor 9,/); assert.match(urow.address_link, /13\.100000,77\.700000/);
  assert.equal((await api("PUT", `/addresses/${a1.body.address.id}`, good, (await signup(phoneN())).token)).status, 404, "cannot edit someone else's address");
  assert.equal((await api("DELETE", `/addresses/${a2.body.address.id}`, undefined, ad.token)).status, 204);
  urow = (await q("select address, address_link from users where user_id=$1", [ad.id]))[0];
  assert.equal(urow.address, a1.body.address.formattedAddress, "deleting the default promotes the other address");
  assert.equal((await api("DELETE", `/addresses/${a1.body.address.id}`, undefined, ad.token)).status, 204);
  urow = (await q("select address, address_link from users where user_id=$1", [ad.id]))[0];
  assert.equal(urow.address, null); assert.equal(urow.address_link, null);
  ok("address needs flat, locality, city, state, pincode and a map pin; users.address + address_link follow the default address");

  // checkout uses a saved address and stores the link on the order
  const prod = await makeProduct("Addr Doll", "50.00", 5);
  const a3 = await api("POST", "/addresses", good, ad.token);
  await fillCart(ad.token, [[prod, 1]]);
  assert.equal((await api("POST", "/payment/create-order", {}, ad.token)).status, 400);
  assert.equal((await api("POST", "/payment/create-order", { addressId: 999999 }, ad.token)).status, 400);
  const other = await signup(phoneN());
  const theirs = await api("POST", "/addresses", good, other.token);
  const stolen = await api("POST", "/payment/create-order", { addressId: theirs.body.address.id }, ad.token);
  assert.equal(stolen.status, 400, "another customer's address cannot be used");
  await setWallet(ad.id, "100.00");
  const placed = await api("POST", "/payment/create-order", { addressId: a3.body.address.id, useWallet: true }, ad.token);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  const orow = (await q("select address, address_link, address_latitude, address_longitude from orders where id=$1", [placed.body.orderId]))[0];
  assert.match(orow.address, /^Asha Rao, \+919876543210 - 12B, Lotus Apartments/);
  assert.equal(orow.address_link, a3.body.address.addressLink); assert.equal(orow.address_latitude, 12.9716);
  const adminOrders = await api("GET", "/admin/orders?q=Asha", undefined, adminToken);
  assert.ok(adminOrders.body.items.some((o: any) => o.id === placed.body.orderId && o.addressLink === a3.body.address.addressLink));
  ok("checkout requires one of the customer's own saved addresses; the order keeps the full address and map link");
}

// =====================================================================================
section("wallet opens only after the last chit payment (is_released)");
{
  const rw = await signup(phoneN(), "Releasing");
  const prod = await makeProduct("Release Doll", "100.00", 5);
  let wl = await api("GET", "/wallet", undefined, rw.token);
  assert.equal(wl.body.isReleased, true, "a customer without a chit plan can use the wallet");
  const plan = await api("POST", "/chits/enroll-custom", { chits: 1 }, rw.token); assert.equal(plan.status, 201);
  assert.equal((await q("select is_released from wallets where user_id=$1", [rw.id]))[0].is_released, true, "under review: wallet still open");
  assert.equal((await api("POST", `/admin/chit-plans/${plan.body.id}/approve`, {}, adminToken)).status, 200);
  let wrow = (await q("select is_released, released_at from wallets where user_id=$1", [rw.id]))[0];
  assert.equal(wrow.is_released, false); assert.equal(wrow.released_at, null);
  wl = await api("GET", "/wallet", undefined, rw.token); assert.equal(wl.body.isReleased, false);
  assert.equal((await api("GET", "/admin/wallets?released=false&pageSize=100", undefined, adminToken)).body.items.some((w: any) => w.userId === rw.id && w.isReleased === false), true);

  // spending is refused while a payment is still due
  await setWallet(rw.id, "500.00");
  await fillCart(rw.token, [[prod, 1]]);
  let co = await api("POST", "/payment/create-order", { address: "x", useWallet: true }, rw.token);
  assert.equal(co.status, 409); assert.equal(co.body.code, "WALLET_LOCKED");
  assert.equal((await wallet(rw.id)).b, "500.00", "nothing was taken");
  assert.equal((await q("select count(*)::int c from orders where user_id=$1", [rw.id]))[0].c, 0);
  // paying online (no wallet) is still possible
  co = await api("POST", "/payment/create-order", { address: "x" }, rw.token);
  assert.equal(co.status, 200, JSON.stringify(co.body));
  await api("POST", "/payment/cancel-order", { dbOrderId: co.body.dbOrderId }, rw.token);

  // a part payment keeps it closed; the final payment opens it
  const { applyChitPayment } = await import("../lib/chit-payments");
  let ap = await applyChitPayment({ chitPlanId: plan.body.id, userId: rw.id, razorpayPaymentId: "pay_rel_1", amountPaise: 50_000 });
  assert.equal(ap.completed, false);
  assert.equal((await q("select is_released from wallets where user_id=$1", [rw.id]))[0].is_released, false);
  ap = await applyChitPayment({ chitPlanId: plan.body.id, userId: rw.id, razorpayPaymentId: "pay_rel_2", amountPaise: 550_000 - 50_000 });
  assert.equal(ap.completed, true);
  wrow = (await q("select is_released, released_at from wallets where user_id=$1", [rw.id]))[0];
  assert.equal(wrow.is_released, true); assert.ok(wrow.released_at);
  wl = await api("GET", "/wallet", undefined, rw.token); assert.equal(wl.body.isReleased, true);
  await fillCart(rw.token, [[prod, 1]]);
  co = await api("POST", "/payment/create-order", { address: "x", useWallet: true }, rw.token);
  assert.equal(co.status, 200, JSON.stringify(co.body)); assert.equal(co.body.paidByWallet, true);
  ok("approved plan closes the wallet (is_released=false, spending refused with WALLET_LOCKED); the last payment opens it and stamps released_at");

  // an account with a second unfinished approved plan stays closed
  const rw2 = await signup(phoneN(), "Cancel");
  const pl2 = await api("POST", "/chits/enroll-custom", { chits: 1 }, rw2.token);
  await api("POST", `/admin/chit-plans/${pl2.body.id}/approve`, {}, adminToken);
  assert.equal((await q("select is_released from wallets where user_id=$1", [rw2.id]))[0].is_released, false);
  ok("closing is per customer: other customers' wallets are unaffected");
}

// =====================================================================================
section("H4 migrations");
{
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const pathMod = await import("node:path");
  const script = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), "../../../../lib/db/migrate.mjs");
  const out = execFileSync(process.execPath, [script, "--status"], { env: { ...process.env, DATABASE_URL: testDb! }, encoding: "utf8" });
  assert.match(out, /Pending: 0/);
  const cols = (await q("select column_name from information_schema.columns where table_name='users'")).map((c2: any) => c2.column_name);
  for (const c2 of ["user_id", "index", "fname", "lname", "phone", "address", "registered_at", "is_reseller", "reseller_code"]) assert.ok(cols.includes(c2), c2);
  assert.ok(!cols.includes("email") && !cols.includes("id") && !cols.includes("name"));
  ok("database is built only from versioned migrations and matches the schema (no pending migrations)");
}

console.log("\nALL END-TO-END CHECKS PASSED");
server.close();
await pool.end();
process.exit(0);
