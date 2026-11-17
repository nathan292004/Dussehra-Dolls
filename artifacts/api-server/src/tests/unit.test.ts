import assert from "node:assert/strict";
import { toPaise, fromPaise, parsePaise, paiseToDecimal, sumPaise, toRupees } from "../lib/money";
import {
  CHIT_VALUE,
  CHIT_DURATION_MONTHS,
  isValidChitCount,
  chitPlanFigures,
  bonusPointsForTotal,
  cycleStartYearFor,
  monthsDueFor,
  getCycleStatus,
  cycleHasEnded,
  enrollmentDue,
  formatRupees,
} from "../lib/chit-rules";
import { generateUserId, isUserId } from "../lib/user-id";
import { isLocked, lockMessage } from "../lib/lockout";
import { maskPhone } from "../lib/twilio";
import { parsePaginationParams, buildPaginationMeta } from "../lib/pagination";
import { generateOrderInvoicePdf, generateChitStatementPdf } from "../lib/document-generator";

console.log("=== RUNNING CORE UNIT TESTS ===");

// 1. Money helpers
console.log("\n--- Testing Money Helpers ---");
assert.equal(toPaise("10.50"), 1050);
assert.equal(toPaise(10.5), 1050);
assert.equal(toPaise("0"), 0);
assert.equal(fromPaise(1050), 10.5);
assert.equal(fromPaise(0), 0);
assert.equal(paiseToDecimal(1050), "10.50");
assert.equal(paiseToDecimal(0), "0.00");
assert.equal(parsePaise("100"), 10000);
assert.equal(parsePaise("100.50"), 10050);
assert.equal(parsePaise("invalid"), null);
assert.equal(parsePaise("-10"), -1000);
assert.equal(parsePaise("10.999"), null);
assert.equal(paiseToDecimal(1050), "10.50");
assert.equal(sumPaise([100, 250, 650]), 1000);
assert.equal(toRupees("1500.00"), 1500);
console.log("  ✔ Money helper unit tests passed");

// 2. Chit Rules
console.log("\n--- Testing Chit Rules ---");
assert.equal(isValidChitCount(1), true);
assert.equal(isValidChitCount(100), true);
assert.equal(isValidChitCount(0), false);
assert.equal(isValidChitCount(101), false);
assert.equal(isValidChitCount(1.5), false);
assert.equal(isValidChitCount("4"), false);

const fig4 = chitPlanFigures(4);
assert.equal(fig4.monthly, 2000);
assert.equal(fig4.total, 22000);
assert.equal(fig4.bonusPoints, 2200);

assert.equal(bonusPointsForTotal(10000), 1000);
assert.equal(bonusPointsForTotal(22000), 2200);

// Cycle status
const cycle = getCycleStatus(new Date("2026-11-15T00:00:00+05:30"));
assert.equal(cycle.open, true);
assert.equal(cycle.startYear, 2026);

assert.equal(cycleHasEnded(2024, new Date("2026-11-15T00:00:00+05:30")), true);
assert.equal(cycleHasEnded(2026, new Date("2026-11-15T00:00:00+05:30")), false);

// Months due calculation
assert.equal(monthsDueFor(2026, new Date("2026-10-15T00:00:00+05:30")), 1);
assert.equal(monthsDueFor(2026, new Date("2026-11-15T00:00:00+05:30")), 2);
assert.equal(monthsDueFor(2026, new Date("2027-08-15T00:00:00+05:30")), 11);

// Enrollment due calculation
const dueTest = enrollmentDue({
  monthly: 2000,
  total: 22000,
  paid: 2000,
  startYear: 2026,
  now: new Date("2026-11-15T00:00:00+05:30"),
});
assert.equal(dueTest.monthsDue, 2);
assert.equal(dueTest.dueToDate, 4000);
assert.equal(dueTest.outstanding, 2000);
assert.equal(dueTest.isCompleted, false);

assert.equal(formatRupees(2000), "₹2,000");
console.log("  ✔ Chit rule unit tests passed");

// 3. User ID generator & validator
console.log("\n--- Testing User ID Helper ---");
const testUid = generateUserId(new Date("2026-11-16T00:00:00+05:30"));
assert.ok(testUid.startsWith("user_161126"));
assert.equal(testUid.length, 16);
assert.equal(isUserId(testUid), true);
assert.equal(isUserId("usr_1234"), false);
assert.equal(isUserId(null), false);
console.log("  ✔ User ID unit tests passed");

// 4. Lockout helpers
console.log("\n--- Testing Lockout Helpers ---");
const futureLock = new Date(Date.now() + 10 * 60 * 1000);
const pastLock = new Date(Date.now() - 10 * 60 * 1000);
assert.equal(isLocked(futureLock), true);
assert.equal(isLocked(pastLock), false);
assert.equal(isLocked(null), false);
assert.match(lockMessage(futureLock), /Too many wrong attempts/);
console.log("  ✔ Lockout helper unit tests passed");

// 5. Sensitive data masking (logging security)
console.log("\n--- Testing PII Log Masking ---");
assert.equal(maskPhone("+919876543210"), "+********3210");
assert.equal(maskPhone("whatsapp:+919876543210"), "+********3210");
assert.equal(maskPhone("1234"), "****");
console.log("  ✔ PII log masking unit tests passed");

// 6. Pagination helpers
console.log("\n--- Testing Pagination Helpers ---");
const p1 = parsePaginationParams({ page: "2", limit: "15" });
assert.equal(p1.page, 2);
assert.equal(p1.limit, 15);
assert.equal(p1.offset, 15);
assert.equal(p1.isPaginatedRequest, true);

const pDefault = parsePaginationParams({});
assert.equal(pDefault.page, 1);
assert.equal(pDefault.limit, 20);
assert.equal(pDefault.offset, 0);
assert.equal(pDefault.isPaginatedRequest, false);

const meta = buildPaginationMeta(45, 2, 20);
assert.equal(meta.total, 45);
assert.equal(meta.totalPages, 3);
assert.equal(meta.hasNext, true);
assert.equal(meta.hasPrev, true);
console.log("  ✔ Pagination unit tests passed");

// 7. PDF Document Generation
console.log("\n--- Testing Document Generation (PDF) ---");
const dummyOrder = {
  id: 101,
  createdAt: new Date(),
  paymentStatus: "paid",
  paymentMethod: "Razorpay",
  items: [{ productName: "Saraswati Idol", quantity: 1, price: 1500, subtotal: 1500 }],
  total: 1500,
  walletAmount: 0,
  onlineAmount: 1500,
  address: "123 Temple Road, Chennai",
};
const dummyUser = {
  userId: "user_test123",
  fname: "Lakshmi",
  lname: "Devi",
  phone: "+919876543210",
};

const invoicePdf = await generateOrderInvoicePdf(dummyOrder, dummyUser);
assert.ok(Buffer.isBuffer(invoicePdf));
assert.ok(invoicePdf.length > 500);
assert.equal(invoicePdf.subarray(0, 4).toString(), "%PDF");

const dummyPlan: any = {
  id: 12,
  userId: "user_test123",
  name: "2 Chits – ₹1,000/month",
  chits: 2,
  monthlyAmount: 1000,
  totalAmount: 11000,
  bonusPoints: 1100,
  durationMonths: 11,
  cycleStartYear: 2026,
  cycleLabel: "October 2026 – August 2027",
  amountPaid: 2000,
  reviewStatus: "active",
};
const statementPdf = await generateChitStatementPdf(dummyPlan, dummyUser, []);
assert.ok(Buffer.isBuffer(statementPdf));
assert.ok(statementPdf.length > 500);
assert.equal(statementPdf.subarray(0, 4).toString(), "%PDF");
console.log("  ✔ PDF Document generation unit tests passed");

console.log("\nALL UNIT TESTS PASSED SUCCESSFULLY ✔\n");
