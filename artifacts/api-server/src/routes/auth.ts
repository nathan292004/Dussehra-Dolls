import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, walletsTable, otpVerificationsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { sendSms } from "../lib/twilio";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateToken(userId: number): string {
  return Buffer.from(`${userId}:${Date.now()}:${Math.random()}`).toString("base64url");
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "+91" + digits.slice(1);
  if (!digits.startsWith("91") && digits.length === 10) return "+91" + digits;
  return "+" + digits;
}

router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    const normalized = normalizePhone(phone);

    const recentOtp = await db
      .select()
      .from(otpVerificationsTable)
      .where(
        and(
          eq(otpVerificationsTable.phone, normalized),
          gt(otpVerificationsTable.expiresAt, new Date(Date.now() - 60_000))
        )
      )
      .limit(1);

    if (recentOtp.length > 0) {
      return res.status(429).json({ error: "Please wait 1 minute before requesting another OTP" });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60_000);

    await db.insert(otpVerificationsTable).values({ phone: normalized, otp, expiresAt });

    try {
      await sendSms(normalized, `Your Dussehra Dolls verification code is: ${otp}. Valid for 10 minutes.`);
    } catch (smsErr) {
      console.error("SMS failed:", smsErr);
      return res.status(500).json({ error: "Failed to send OTP. Please try again." });
    }

    return res.json({ success: true, message: `OTP sent to ${normalized}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { name, phone, password, otp } = req.body;
    if (!name || !phone || !password || !otp) {
      return res.status(400).json({ error: "Name, phone, password and OTP are required" });
    }

    const normalized = normalizePhone(phone);

    const validOtp = await db
      .select()
      .from(otpVerificationsTable)
      .where(
        and(
          eq(otpVerificationsTable.phone, normalized),
          eq(otpVerificationsTable.otp, otp),
          gt(otpVerificationsTable.expiresAt, new Date())
        )
      )
      .limit(1);

    if (validOtp.length === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: "Phone number already registered" });
    }

    await db
      .update(otpVerificationsTable)
      .set({ verified: true })
      .where(eq(otpVerificationsTable.id, validOtp[0].id));

    const [user] = await db
      .insert(usersTable)
      .values({
        name,
        email: `${normalized.replace("+", "")}@dussehradolls.app`,
        phone: normalized,
        passwordHash: hashPassword(password),
      })
      .returning();

    await db.insert(walletsTable).values({ userId: user.id });

    const token = generateToken(user.id);
    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password required" });
    }

    const normalized = normalizePhone(phone);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    const token = generateToken(user.id);
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, "base64url").toString();
    const userId = parseInt(decoded.split(":")[0]);
    if (isNaN(userId)) return res.status(401).json({ error: "Invalid token" });
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
