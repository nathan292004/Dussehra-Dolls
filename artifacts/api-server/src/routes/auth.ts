import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  usersTable,
  walletsTable,
  transactionsTable,
  cartItemsTable,
  ordersTable,
  chitPlansTable,
  otpVerificationsTable,
} from "@workspace/db/schema";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { sendSms, SmsDeliveryError } from "../lib/twilio";
import { recordNotification } from "../lib/notify";
import { signToken, CUSTOMER_TOKEN_TTL_SECONDS } from "../lib/jwt";
import { authMiddleware, AuthRequest } from "../middlewares/auth";
import {
  MAX_FAILED_LOGINS,
  LOCK_MINUTES,
  isLocked,
  lockMessage,
  isUniqueViolation,
} from "../lib/lockout";
import { toPaise } from "../lib/money";
import { withNewUserId } from "../lib/user-id";

const router = Router();

// ─── Passwords (bcrypt) ──────────────────────────────────────────────────────
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
// bcrypt only uses the first 72 bytes of a password, so longer ones are refused.
const MAX_PASSWORD_BYTES = 72;
const MIN_PASSWORD_LENGTH = 6;
// Compared against when the phone number is unknown, so timing doesn't reveal which numbers exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} characters`;
  }
  return null;
}

// ─── OTP rules ───────────────────────────────────────────────────────────────
const OTP_VALID_MINUTES = 10;
const OTP_MAX_WRONG_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_SENDS_PER_HOUR = 5;

type OtpPurpose = "register" | "reset";

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * One canonical form per number, e.g. "+919876543210". A plain 10-digit number (even one that
 * happens to start with 91) is an Indian mobile; "+" means the country code is already there.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return "+" + digits;
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "+91" + digits.slice(1);
  return "+" + digits;
}

/** Returns the normalized phone, or null if it doesn't look like a real number. */
function validPhone(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const sanitized = phone.replace(/[^\d+\-\s()]/g, "").trim();
  if (sanitized.length < 10 || sanitized.length > 15) return null;
  const normalized = normalizePhone(phone);
  return /^\+\d{10,15}$/.test(normalized) ? normalized : null;
}

function sameOtp(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

type OtpResult = { ok: true; id: number } | { ok: false; status: number; error: string };

/**
 * Checks a code the customer typed. A code works once, for one purpose, for 10 minutes, and
 * dies after 5 wrong guesses. (The caller marks it used in the same transaction as its action.)
 */
async function checkOtp(phone: string, purpose: OtpPurpose, code: string): Promise<OtpResult> {
  const [row] = await db
    .select()
    .from(otpVerificationsTable)
    .where(
      and(
        eq(otpVerificationsTable.phone, phone),
        eq(otpVerificationsTable.purpose, purpose),
        eq(otpVerificationsTable.verified, false),
        eq(otpVerificationsTable.isDeleted, false),
        gt(otpVerificationsTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpVerificationsTable.createdAt), desc(otpVerificationsTable.id))
    .limit(1);

  if (!row) return { ok: false, status: 400, error: "Invalid or expired OTP. Please request a new one." };
  if (row.attempts >= OTP_MAX_WRONG_ATTEMPTS) {
    return { ok: false, status: 429, error: "Too many wrong attempts. Please request a new OTP." };
  }
  if (sameOtp(row.otp, code)) return { ok: true, id: row.id };

  const [updated] = await db
    .update(otpVerificationsTable)
    .set({ attempts: sql`${otpVerificationsTable.attempts} + 1` })
    .where(eq(otpVerificationsTable.id, row.id))
    .returning({ attempts: otpVerificationsTable.attempts });
  const left = OTP_MAX_WRONG_ATTEMPTS - (updated?.attempts ?? OTP_MAX_WRONG_ATTEMPTS);
  return left > 0
    ? { ok: false, status: 400, error: `Incorrect OTP. ${left} attempt${left === 1 ? "" : "s"} left.` }
    : { ok: false, status: 429, error: "Too many wrong attempts. Please request a new OTP." };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
type UserRow = typeof usersTable.$inferSelect;

const fullName = (u: Pick<UserRow, "fname" | "lname">) => [u.fname, u.lname].filter(Boolean).join(" ");

const publicUser = (u: UserRow) => ({
  id: u.userId,
  userId: u.userId,
  index: u.index,
  fname: u.fname,
  lname: u.lname,
  name: fullName(u),
  phone: u.phone,
  address: u.address,
  isReseller: u.isReseller,
});

const sessionFor = (u: UserRow) => ({
  token: signToken("customer", u.userId),
  expiresIn: CUSTOMER_TOKEN_TTL_SECONDS,
  user: publicUser(u),
});

async function findLiveUser(phone: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.phone, phone), eq(usersTable.isDeleted, false)))
    .limit(1);
  return user;
}

const ALREADY_REGISTERED = {
  error: "This number is already registered. Please sign in, or use Forgot Password.",
  code: "PHONE_ALREADY_REGISTERED",
};

function nameProblem(fname: unknown, lname: unknown): string | null {
  if (typeof fname !== "string" || fname.trim().length < 1 || fname.trim().length > 50) {
    return "First name must be 1-50 characters";
  }
  if (lname !== undefined && lname !== null && lname !== "" &&
      (typeof lname !== "string" || lname.trim().length > 50)) {
    return "Last name must be at most 50 characters";
  }
  return null;
}

// ─── Send OTP (registration or forgot password) ──────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const phone = validPhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: "Invalid phone number format" });
    const purpose: OtpPurpose = req.body?.purpose === "reset" ? "reset" : "register";

    const existing = await findLiveUser(phone);
    if (purpose === "register" && existing) return res.status(409).json(ALREADY_REGISTERED);
    if (purpose === "reset" && !existing) {
      return res.status(404).json({ error: "No account found with this number.", code: "PHONE_NOT_REGISTERED" });
    }

    const [{ lastMinute, lastHour }] = await db
      .select({
        lastMinute: sql<number>`count(*) filter (where ${otpVerificationsTable.createdAt} > now() - interval '${sql.raw(String(OTP_RESEND_SECONDS))} seconds')::int`,
        lastHour: sql<number>`count(*) filter (where ${otpVerificationsTable.createdAt} > now() - interval '1 hour')::int`,
      })
      .from(otpVerificationsTable)
      .where(and(eq(otpVerificationsTable.phone, phone), eq(otpVerificationsTable.isDeleted, false)));
    if (lastMinute > 0) {
      return res.status(429).json({ error: "Please wait 1 minute before requesting another OTP" });
    }
    if (lastHour >= OTP_MAX_SENDS_PER_HOUR) {
      return res.status(429).json({ error: "Too many OTP requests. Please try again in an hour." });
    }

    const otp = generateOtp();
    const [verification] = await db
      .insert(otpVerificationsTable)
      .values({ phone, otp, purpose, expiresAt: new Date(Date.now() + OTP_VALID_MINUTES * 60_000) })
      .returning();

    const meta = { userId: existing?.userId ?? null, kind: purpose === "reset" ? "otp_reset" : "otp_register" } as const;
    try {
      await sendSms(phone, `Your DollDime verification code is: ${otp}. Valid for ${OTP_VALID_MINUTES} minutes.`);
      await recordNotification(meta, "sms", phone, { ok: true });
    } catch (smsErr) {
      await recordNotification(meta, "sms", phone, {
        ok: false,
        error: smsErr instanceof SmsDeliveryError ? smsErr.code : "SMS_PROVIDER_UNAVAILABLE",
      });
      // Hide the unsent code (soft delete, nothing is removed) so it can't be used.
      await db
        .update(otpVerificationsTable)
        .set({ isDeleted: true })
        .where(eq(otpVerificationsTable.id, verification.id));
      console.error("SMS failed:", smsErr instanceof SmsDeliveryError ? smsErr.code : "SMS_PROVIDER_UNAVAILABLE");
      return res.status(503).json({
        error:
          process.env.NODE_ENV === "development" && smsErr instanceof SmsDeliveryError
            ? smsErr.message
            : "SMS verification is temporarily unavailable. Please try again later.",
        code: smsErr instanceof SmsDeliveryError ? smsErr.code : "SMS_PROVIDER_UNAVAILABLE",
      });
    }

    return res.json({ success: true, message: `OTP sent to ${phone}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Register ────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { fname, lname, password, otp } = req.body ?? {};
    const phone = validPhone(req.body?.phone);
    if (!fname || !req.body?.phone || !password || !otp) {
      return res.status(400).json({ error: "First name, phone, password and OTP are required" });
    }
    const nameErr = nameProblem(fname, lname);
    if (nameErr) return res.status(400).json({ error: nameErr });
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });
    const pwProblem = passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem });
    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: "OTP must be a 6-digit code" });
    }

    // The number must not belong to a live account. Checked before the OTP so a
    // registered customer is told so (and their guesses are not spent).
    if (await findLiveUser(phone)) return res.status(409).json(ALREADY_REGISTERED);

    const check = await checkOtp(phone, "register", otp);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const passwordHash = await hashPassword(password);
    try {
      const user = await withNewUserId((userId) =>
        db.transaction(async (tx) => {
          const used = await tx
            .update(otpVerificationsTable)
            .set({ verified: true })
            .where(and(eq(otpVerificationsTable.id, check.id), eq(otpVerificationsTable.verified, false)))
            .returning({ id: otpVerificationsTable.id });
          if (!used.length) throw new Error("OTP_ALREADY_USED");

          const [created] = await tx
            .insert(usersTable)
            .values({
              userId,
              fname: fname.trim(),
              lname: typeof lname === "string" && lname.trim() ? lname.trim() : null,
              phone,
              passwordHash,
            })
            .returning();
          await tx.insert(walletsTable).values({ userId: created.userId });
          return created;
        }),
      );
      return res.status(201).json(sessionFor(user));
    } catch (err) {
      // Two people registering the same number at the same moment: the database lets only one win.
      if (isUniqueViolation(err)) return res.status(409).json(ALREADY_REGISTERED);
      if (err instanceof Error && err.message === "OTP_ALREADY_USED") {
        return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Login (5 wrong passwords locks the account for 15 minutes) ──────────────
router.post("/login", async (req, res) => {
  try {
    const { password } = req.body ?? {};
    const phone = validPhone(req.body?.phone);
    if (!req.body?.phone || !password) {
      return res.status(400).json({ error: "Phone and password required" });
    }
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });
    if (typeof password !== "string" || password.length > 128) {
      return res.status(400).json({ error: "Invalid password" });
    }

    const user = await findLiveUser(phone);
    const now = new Date();

    if (user && isLocked(user.lockedUntil, now)) {
      return res.status(429).json({ error: lockMessage(user.lockedUntil!, now), code: "ACCOUNT_LOCKED" });
    }
    // A lock that has run out starts the count again.
    if (user && user.lockedUntil && !isLocked(user.lockedUntil, now)) {
      await db.update(usersTable).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(usersTable.userId, user.userId));
      user.failedLoginAttempts = 0;
    }

    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.isActive || !ok) {
      if (user) {
        const [updated] = await db
          .update(usersTable)
          .set({ failedLoginAttempts: sql`${usersTable.failedLoginAttempts} + 1` })
          .where(eq(usersTable.userId, user.userId))
          .returning({ attempts: usersTable.failedLoginAttempts });
        if (updated && updated.attempts >= MAX_FAILED_LOGINS) {
          const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
          await db.update(usersTable).set({ lockedUntil }).where(eq(usersTable.userId, user.userId));
          return res.status(429).json({ error: lockMessage(lockedUntil), code: "ACCOUNT_LOCKED" });
        }
      }
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await db.update(usersTable).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(usersTable.userId, user.userId));
    }
    return res.json(sessionFor(user));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Forgot password ─────────────────────────────────────────────────────────
// After the OTP check, the old account row is soft-deleted and a NEW row with the same
// phone and the new password is created (with a new user id). Everything the customer owns
// (wallet, orders, chit plans, cart, transactions) is moved to the new row so nothing is lost.
router.post("/reset-password", async (req, res) => {
  try {
    const { newPassword, otp } = req.body ?? {};
    const phone = validPhone(req.body?.phone);
    if (!req.body?.phone || !newPassword || !otp) {
      return res.status(400).json({ error: "Phone, OTP and new password are required" });
    }
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });
    const pwProblem = passwordProblem(newPassword);
    if (pwProblem) return res.status(400).json({ error: pwProblem });
    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: "OTP must be a 6-digit code" });
    }

    if (!(await findLiveUser(phone))) {
      return res.status(404).json({ error: "No account found with this number.", code: "PHONE_NOT_REGISTERED" });
    }
    const check = await checkOtp(phone, "reset", otp);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const passwordHash = await hashPassword(newPassword);
    try {
      const fresh = await withNewUserId((newUserId) =>
        db.transaction(async (tx) => {
          const used = await tx
            .update(otpVerificationsTable)
            .set({ verified: true })
            .where(and(eq(otpVerificationsTable.id, check.id), eq(otpVerificationsTable.verified, false)))
            .returning({ id: otpVerificationsTable.id });
          if (!used.length) throw new Error("OTP_ALREADY_USED");

          const [old] = await tx
            .select()
            .from(usersTable)
            .where(and(eq(usersTable.phone, phone), eq(usersTable.isDeleted, false)))
            .for("update");
          if (!old) throw new Error("ACCOUNT_GONE");

          // The reseller code is unique, so the old row lets go of it and the new row takes it.
          await tx
            .update(usersTable)
            .set({ isDeleted: true, deletedAt: new Date(), deletionReason: "password_reset", resellerCode: null })
            .where(eq(usersTable.userId, old.userId));

          const [created] = await tx
            .insert(usersTable)
            .values({
              userId: newUserId,
              fname: old.fname,
              lname: old.lname,
              phone,
              address: old.address,
              registeredAt: old.registeredAt,
              isReseller: old.isReseller,
              resellerCode: old.resellerCode,
              passwordHash,
              isActive: old.isActive,
            })
            .returning();

          // Hand everything the customer owns over to the new row.
          await tx.update(walletsTable).set({ userId: created.userId }).where(eq(walletsTable.userId, old.userId));
          await tx.update(transactionsTable).set({ userId: created.userId }).where(eq(transactionsTable.userId, old.userId));
          await tx.update(ordersTable).set({ userId: created.userId }).where(eq(ordersTable.userId, old.userId));
          await tx.update(cartItemsTable).set({ userId: created.userId }).where(eq(cartItemsTable.userId, old.userId));
          await tx.update(chitPlansTable).set({ userId: created.userId }).where(eq(chitPlansTable.userId, old.userId));
          const hasWallet = await tx
            .select({ id: walletsTable.id })
            .from(walletsTable)
            .where(eq(walletsTable.userId, created.userId))
            .limit(1);
          if (!hasWallet.length) await tx.insert(walletsTable).values({ userId: created.userId });
          return created;
        }),
      );
      return res.json(sessionFor(fresh));
    } catch (err) {
      if (err instanceof Error && err.message === "OTP_ALREADY_USED") {
        return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
      }
      if (err instanceof Error && err.message === "ACCOUNT_GONE") {
        return res.status(404).json({ error: "No account found with this number.", code: "PHONE_NOT_REGISTERED" });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Current user ────────────────────────────────────────────────────────────
router.get("/me", authMiddleware as any, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, req.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.json(publicUser(user));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete account (soft delete) ────────────────────────────────────────────
// Needs the password. Refused while money or open orders are tied to the account.
// The row stays (is_deleted) and the phone number can register again as a fresh account.
router.delete("/account", authMiddleware as any, async (req: AuthRequest, res) => {
  try {
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Please enter your password to delete your account" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, req.userId!)).limit(1);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const now = new Date();
    if (isLocked(user.lockedUntil, now)) {
      return res.status(429).json({ error: lockMessage(user.lockedUntil!, now), code: "ACCOUNT_LOCKED" });
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const [updated] = await db
        .update(usersTable)
        .set({ failedLoginAttempts: sql`${usersTable.failedLoginAttempts} + 1` })
        .where(eq(usersTable.userId, user.userId))
        .returning({ attempts: usersTable.failedLoginAttempts });
      if (updated && updated.attempts >= MAX_FAILED_LOGINS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        await db.update(usersTable).set({ lockedUntil }).where(eq(usersTable.userId, user.userId));
        return res.status(429).json({ error: lockMessage(lockedUntil), code: "ACCOUNT_LOCKED" });
      }
      // 403 (not 401) so the app doesn't mistake a wrong password for an expired session.
      return res.status(403).json({ error: "Incorrect password" });
    }

    const reasons: string[] = [];
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, user.userId)).limit(1);
    if (wallet && toPaise(wallet.balance) > 0) {
      reasons.push("You still have money in your wallet. Please use it or contact support before deleting your account.");
    }
    if (wallet && toPaise(wallet.chitLockedBalance) > 0) {
      reasons.push("You have savings locked in a chit plan. It can be deleted after the plan completes.");
    }
    const plans = await db.select().from(chitPlansTable).where(eq(chitPlansTable.userId, user.userId));
    // Plans with nothing paid (still under review, or approved but unpaid) are simply closed.
    const unpaidPlanIds = plans
      .filter((p) => p.status === "active" && !p.isRejected && toPaise(p.amountPaid) === 0)
      .map((p) => p.id);
    const openOrders = await db
      .select({ id: ordersTable.id, status: ordersTable.status, walletAmount: ordersTable.walletAmount })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, user.userId),
          inArray(ordersTable.status, ["pending", "confirmed", "processing", "shipped"]),
        ),
      );
    if (openOrders.some((o) => o.status !== "pending" || toPaise(o.walletAmount) > 0)) {
      reasons.push("You have an order that is not delivered yet. Please wait until it is delivered.");
    }
    if (reasons.length) {
      return res.status(409).json({ error: reasons[0], reasons, code: "ACCOUNT_HAS_OPEN_ITEMS" });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ isDeleted: true, deletedAt: new Date(), deletionReason: "account_deleted" })
        .where(eq(usersTable.userId, user.userId));
      if (unpaidPlanIds.length) {
        await tx
          .update(chitPlansTable)
          .set({ status: "cancelled" })
          .where(inArray(chitPlansTable.id, unpaidPlanIds));
      }
    });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
