import PDFDocument from "pdfkit";
import type { Order } from "@workspace/db/schema";
import type { User } from "@workspace/db/schema";
import type { describeChitPlan } from "./chit-view";

export interface InvoiceOrderData {
  id: number;
  createdAt: Date | string;
  paymentStatus: string;
  paymentMethod?: string | null;
  items: Array<{
    productId?: number;
    productName: string;
    quantity: number;
    price: number;
    subtotal: number;
  }>;
  total: number | string;
  walletAmount: number | string;
  onlineAmount: number | string;
  address?: string | null;
}

export interface InvoiceUserData {
  userId: string;
  fname: string;
  lname?: string | null;
  phone: string;
}

export interface ChitTransactionRecord {
  id: number;
  type: string;
  amount: number | string;
  createdAt: Date | string;
  description?: string | null;
  razorpayPaymentId?: string | null;
}

/**
 * Generates a clean, professional, print-ready PDF invoice for an order.
 */
export async function generateOrderInvoicePdf(
  order: InvoiceOrderData,
  user: InvoiceUserData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const primaryColor = "#c97a24";
    const darkColor = "#1e293b";
    const mutedColor = "#64748b";
    const borderColor = "#e2e8f0";

    // Header
    doc.fillColor(primaryColor).fontSize(24).font("Helvetica-Bold").text("DollDime", 40, 40);
    doc.fillColor(mutedColor).fontSize(10).font("Helvetica").text("Handcrafted Golu Dolls & Chit Savings", 40, 68);

    doc.fillColor(darkColor).fontSize(18).font("Helvetica-Bold").text("TAX INVOICE", 380, 40, { align: "right" });
    doc.fillColor(mutedColor).fontSize(10).font("Helvetica").text(`Invoice #: INV-ORD-${order.id.toString().padStart(6, "0")}`, 380, 64, { align: "right" });
    const orderDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    doc.text(`Date: ${orderDate}`, 380, 78, { align: "right" });
    doc.text(`Status: ${(order.paymentStatus || "PAID").toUpperCase()}`, 380, 92, { align: "right" });

    // Divider
    doc.strokeColor(borderColor).lineWidth(1).moveTo(40, 115).lineTo(555, 115).stroke();

    // Seller & Buyer Details
    let y = 130;
    doc.fillColor(darkColor).fontSize(11).font("Helvetica-Bold").text("Seller Details:", 40, y);
    doc.fillColor(mutedColor).fontSize(9).font("Helvetica");
    doc.text("DollDime Heritage Crafts Pvt. Ltd.", 40, y + 15);
    doc.text("GSTIN: 33AAAAA0000A1Z5", 40, y + 27);
    doc.text("Tamil Nadu, India", 40, y + 39);
    doc.text("Email: support@dolldime.com | WhatsApp: +91 93602 92900", 40, y + 51);

    doc.fillColor(darkColor).fontSize(11).font("Helvetica-Bold").text("Billed & Shipped To:", 320, y);
    doc.fillColor(mutedColor).fontSize(9).font("Helvetica");
    const buyerName = [user.fname, user.lname].filter(Boolean).join(" ") || "Valued Customer";
    doc.text(buyerName, 320, y + 15);
    doc.text(`Phone: ${user.phone}`, 320, y + 27);
    doc.text(`Address: ${order.address || "Standard Delivery Address"}`, 320, y + 39, { width: 235 });

    // Line items table
    y = 215;
    doc.rect(40, y, 515, 24).fill("#f8fafc").stroke(borderColor);
    doc.fillColor(darkColor).fontSize(9).font("Helvetica-Bold");
    doc.text("Item / Doll Description", 50, y + 7);
    doc.text("Qty", 340, y + 7, { width: 40, align: "center" });
    doc.text("Unit Price", 400, y + 7, { width: 60, align: "right" });
    doc.text("Total", 480, y + 7, { width: 65, align: "right" });

    y += 24;
    doc.font("Helvetica").fontSize(9);

    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item, index) => {
      const bg = index % 2 === 1 ? "#fafbfc" : "#ffffff";
      doc.rect(40, y, 515, 22).fill(bg).stroke(borderColor);
      doc.fillColor(darkColor);
      doc.text(item.productName || "Product", 50, y + 6, { width: 280, ellipsis: true });
      doc.text(String(item.quantity || 1), 340, y + 6, { width: 40, align: "center" });
      const price = typeof item.price === "number" ? item.price : parseFloat(String(item.price)) || 0;
      doc.text(`Rs. ${price.toFixed(2)}`, 400, y + 6, { width: 60, align: "right" });
      const sub = typeof item.subtotal === "number" ? item.subtotal : price * (item.quantity || 1);
      doc.text(`Rs. ${sub.toFixed(2)}`, 480, y + 6, { width: 65, align: "right" });
      y += 22;
    });

    // Summary totals
    y += 15;
    const totalNum = typeof order.total === "number" ? order.total : parseFloat(String(order.total)) || 0;
    const walletNum = typeof order.walletAmount === "number" ? order.walletAmount : parseFloat(String(order.walletAmount)) || 0;
    const onlineNum = typeof order.onlineAmount === "number" ? order.onlineAmount : Math.max(0, totalNum - walletNum);

    doc.rect(340, y, 215, 80).stroke(borderColor);
    doc.fontSize(9).font("Helvetica");
    doc.text("Order Subtotal:", 350, y + 10);
    doc.text(`Rs. ${totalNum.toFixed(2)}`, 450, y + 10, { width: 95, align: "right" });

    if (walletNum > 0) {
      doc.text("Wallet Applied:", 350, y + 25);
      doc.text(`- Rs. ${walletNum.toFixed(2)}`, 450, y + 25, { width: 95, align: "right" });
      doc.text("Net Paid Online:", 350, y + 40);
      doc.text(`Rs. ${onlineNum.toFixed(2)}`, 450, y + 40, { width: 95, align: "right" });
    }

    doc.font("Helvetica-Bold").fontSize(10).fillColor(primaryColor);
    doc.text("Grand Total Paid:", 350, y + 60);
    doc.text(`Rs. ${totalNum.toFixed(2)}`, 450, y + 60, { width: 95, align: "right" });

    // Payment method note
    doc.font("Helvetica").fontSize(9).fillColor(mutedColor);
    doc.text(`Payment Method: ${order.paymentMethod || "Prepaid (Razorpay / Wallet)"}`, 40, y + 20);
    doc.text("All taxes included under applicable GST rates.", 40, y + 35);

    // Footer
    doc.strokeColor(borderColor).lineWidth(0.5).moveTo(40, 750).lineTo(555, 750).stroke();
    doc.fontSize(8).fillColor(mutedColor).text(
      "Thank you for celebrating Dussehra with DollDime. This is a computer generated invoice and requires no physical signature.",
      40,
      760,
      { align: "center", width: 515 },
    );

    doc.end();
  });
}

/**
 * Generates an official Chit Savings Membership Receipt & Statement PDF.
 */
export async function generateChitStatementPdf(
  plan: ReturnType<typeof describeChitPlan>,
  user: InvoiceUserData,
  transactions: ChitTransactionRecord[] = [],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const primaryColor = "#c97a24";
    const darkColor = "#1e293b";
    const mutedColor = "#64748b";
    const borderColor = "#e2e8f0";

    // Header
    doc.fillColor(primaryColor).fontSize(22).font("Helvetica-Bold").text("DollDime", 40, 40);
    doc.fillColor(mutedColor).fontSize(10).font("Helvetica").text("Dussehra Golu Chit Savings Scheme", 40, 66);

    doc.fillColor(darkColor).fontSize(16).font("Helvetica-Bold").text("CHIT STATEMENT", 350, 40, { align: "right" });
    doc.fillColor(mutedColor).fontSize(9).font("Helvetica").text(`Plan ID: #CHIT-${plan.id.toString().padStart(6, "0")}`, 350, 62, { align: "right" });
    doc.text(`Status: ${plan.reviewStatus.toUpperCase()}`, 350, 75, { align: "right" });
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 350, 88, { align: "right" });

    // Divider
    doc.strokeColor(borderColor).lineWidth(1).moveTo(40, 110).lineTo(555, 110).stroke();

    // Member & Scheme Details
    let y = 125;
    doc.fillColor(darkColor).fontSize(11).font("Helvetica-Bold").text("Member Information:", 40, y);
    doc.fillColor(mutedColor).fontSize(9).font("Helvetica");
    const memberName = [user.fname, user.lname].filter(Boolean).join(" ") || "Member";
    doc.text(`Name: ${memberName}`, 40, y + 15);
    doc.text(`Member ID: ${user.userId}`, 40, y + 27);
    doc.text(`Phone: ${user.phone}`, 40, y + 39);

    doc.fillColor(darkColor).fontSize(11).font("Helvetica-Bold").text("Plan Specifications:", 320, y);
    doc.fillColor(mutedColor).fontSize(9).font("Helvetica");
    doc.text(`Plan Name: ${plan.name}`, 320, y + 15);
    doc.text(`Cycle: ${plan.cycleLabel}`, 320, y + 27);
    doc.text(`Tenure: ${plan.durationMonths} Months (Oct - Aug)`, 320, y + 39);
    doc.text(`Monthly Installment: Rs. ${plan.monthlyAmount.toLocaleString("en-IN")}`, 320, y + 51);

    // Financial Overview Box
    y = 200;
    doc.rect(40, y, 515, 65).fill("#fdf8f0").stroke(borderColor);
    doc.fillColor(darkColor).fontSize(10).font("Helvetica-Bold");

    doc.text("Total Plan Value", 60, y + 12);
    doc.fillColor(primaryColor).fontSize(14).text(`Rs. ${plan.totalAmount.toLocaleString("en-IN")}`, 60, y + 28);

    doc.fillColor(darkColor).fontSize(10);
    doc.text("Amount Paid", 230, y + 12);
    doc.fillColor("#10b981").fontSize(14).text(`Rs. ${plan.amountPaid.toLocaleString("en-IN")}`, 230, y + 28);

    doc.fillColor(darkColor).fontSize(10);
    doc.text("Bonus Points", 410, y + 12);
    doc.fillColor(primaryColor).fontSize(14).text(`${plan.bonusPoints} pts`, 410, y + 28);

    // Transaction history table
    y = 290;
    doc.fillColor(darkColor).fontSize(12).font("Helvetica-Bold").text("Payment History & Receipts", 40, y);
    y += 18;

    doc.rect(40, y, 515, 22).fill("#f8fafc").stroke(borderColor);
    doc.fillColor(darkColor).fontSize(9).font("Helvetica-Bold");
    doc.text("Date", 50, y + 6);
    doc.text("Transaction Ref / Payment ID", 150, y + 6);
    doc.text("Type", 380, y + 6);
    doc.text("Amount", 470, y + 6, { width: 75, align: "right" });

    y += 22;
    doc.font("Helvetica").fontSize(9);

    if (!transactions.length) {
      doc.rect(40, y, 515, 24).fill("#ffffff").stroke(borderColor);
      doc.fillColor(mutedColor).text("No recorded payments yet for this plan.", 50, y + 7);
      y += 24;
    } else {
      transactions.forEach((tx, idx) => {
        const bg = idx % 2 === 1 ? "#fafbfc" : "#ffffff";
        doc.rect(40, y, 515, 22).fill(bg).stroke(borderColor);
        doc.fillColor(darkColor);
        const txDate = new Date(tx.createdAt).toLocaleDateString("en-IN");
        doc.text(txDate, 50, y + 6);
        doc.text(tx.razorpayPaymentId || `TXN-${tx.id}`, 150, y + 6, { width: 220, ellipsis: true });
        doc.text((tx.type || "debit").toUpperCase(), 380, y + 6);
        const amt = typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount)) || 0;
        doc.text(`Rs. ${amt.toLocaleString("en-IN")}`, 470, y + 6, { width: 75, align: "right" });
        y += 22;
      });
    }

    // Terms note
    y += 30;
    doc.fontSize(8).fillColor(mutedColor);
    doc.text("Important Terms & Information:", 40, y);
    doc.text(
      "1. Monthly installments are due between the 1st and 10th of every month during the active cycle.",
      40,
      y + 12,
    );
    doc.text(
      "2. Bonus points and total savings are unlocked upon full completion of 11 consecutive installments.",
      40,
      y + 22,
    );
    doc.text(
      "3. Unlocked balances can be used towards purchasing exquisite Golu dolls on the DollDime app.",
      40,
      y + 32,
    );

    // Footer
    doc.strokeColor(borderColor).lineWidth(0.5).moveTo(40, 750).lineTo(555, 750).stroke();
    doc.fontSize(8).fillColor(mutedColor).text(
      "DollDime Heritage Crafts Pvt. Ltd. | Customer Support: support@dolldime.com | Verified Digital Statement",
      40,
      760,
      { align: "center", width: 515 },
    );

    doc.end();
  });
}
