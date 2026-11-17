import { Router } from "express";

const router = Router();

const DELETION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account & Data Deletion – DollDime</title>
  <style>
    :root {
      --primary: #c97a24;
      --primary-hover: #b36a1c;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --danger: #ef4444;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 24px 16px;
    }
    .container {
      max-width: 680px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: var(--primary);
      letter-spacing: -0.5px;
    }
    .sub-title {
      font-size: 16px;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .card {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid var(--border);
    }
    h2 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 16px;
      color: var(--text);
    }
    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-top: 16px;
      margin-bottom: 8px;
    }
    p {
      margin-bottom: 12px;
      color: var(--text);
      font-size: 14px;
    }
    ul {
      margin-left: 20px;
      margin-bottom: 16px;
      font-size: 14px;
      color: var(--text);
    }
    li {
      margin-bottom: 6px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text);
    }
    input[type="tel"], input[type="password"], input[type="text"] {
      width: 100%;
      padding: 10px 14px;
      font-size: 15px;
      border: 1px solid var(--border);
      border-radius: 8px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: var(--primary);
    }
    .btn {
      display: inline-block;
      width: 100%;
      background: var(--danger);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      padding: 12px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #dc2626;
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .alert {
      padding: 12px 16px;
      border-radius: 8px;
      margin-top: 16px;
      font-size: 14px;
      display: none;
    }
    .alert-error {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }
    .alert-success {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .contact-box {
      font-size: 13px;
      color: var(--text-muted);
      background: #f1f5f9;
      border-radius: 8px;
      padding: 16px;
      margin-top: 20px;
    }
    .footer {
      text-align: center;
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">DollDime</div>
      <div class="sub-title">Account & Data Deletion Portal (Google Play Policy Compliance)</div>
    </div>

    <div class="card">
      <h2>Delete Your Account and Personal Data</h2>
      <p>
        In accordance with Google Play's user data policies and applicable privacy regulations,
        DollDime provides our users with full control over their account and personal information.
        You may request the deletion of your account and personal data either directly through the
        DollDime mobile app or using this web portal.
      </p>

      <h3>What data will be deleted immediately:</h3>
      <ul>
        <li><strong>Profile Data:</strong> Your first name, last name, and profile details will be scrubbed and anonymized.</li>
        <li><strong>Address Book:</strong> All saved delivery addresses will be permanently deleted from our database.</li>
        <li><strong>Shopping Cart:</strong> Any active cart items will be immediately removed.</li>
        <li><strong>Pending Chits:</strong> Any unpaid or pending chit plan submissions will be cancelled.</li>
        <li><strong>Credentials:</strong> Your active sessions and login tokens will be permanently revoked.</li>
      </ul>

      <h3>What data is retained and why:</h3>
      <p>
        Under applicable statutory regulations (including Section 128 of the Companies Act and Indian GST/tax laws),
        records of financial transactions, completed purchases, invoices, and completed chit payouts must be
        retained for accounting, fraud prevention, and audit compliance for the legally mandated period.
        These historical records remain disassociated from your active personal profile.
      </p>

      <h3>Eligibility criteria:</h3>
      <ul>
        <li>Your wallet balance must be ₹0.00 (please spend or transfer remaining funds).</li>
        <li>You cannot have active savings in an ongoing chit plan.</li>
        <li>You cannot have orders currently in-transit or pending delivery.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Self-Service Account Deletion</h2>
      <p>Enter your registered mobile number and password below to confirm and process account deletion immediately:</p>

      <form id="deleteForm" onsubmit="handleDelete(event)">
        <div class="form-group">
          <label for="phone">Registered Mobile Number</label>
          <input type="tel" id="phone" placeholder="e.g. 9876543210" required />
        </div>
        <div class="form-group">
          <label for="password">Account Password</label>
          <input type="password" id="password" placeholder="Enter your password" required />
        </div>
        <button type="submit" id="submitBtn" class="btn">Permanently Delete My Account</button>
      </form>

      <div id="errorAlert" class="alert alert-error"></div>
      <div id="successAlert" class="alert alert-success"></div>

      <div class="contact-box">
        <strong>Need help or forgot your password?</strong><br>
        If you are unable to access your password or need manual assistance, email us at
        <a href="mailto:support@dolldime.com" style="color: var(--primary);">support@dolldime.com</a> or message our WhatsApp support at
        <strong>+91 93602 92900</strong> with your registered mobile number. Manual deletion requests are processed within 48 to 72 hours.
      </div>
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} DollDime. All rights reserved.
    </div>
  </div>

  <script>
    async function handleDelete(e) {
      e.preventDefault();
      const phoneInput = document.getElementById("phone").value.trim();
      const passwordInput = document.getElementById("password").value;
      const submitBtn = document.getElementById("submitBtn");
      const errorAlert = document.getElementById("errorAlert");
      const successAlert = document.getElementById("successAlert");

      errorAlert.style.display = "none";
      successAlert.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.innerText = "Processing deletion...";

      try {
        const res = await fetch("/api/auth/web-delete-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phoneInput, password: passwordInput }),
        });
        const data = await res.json();

        if (!res.ok) {
          errorAlert.innerText = data.error || (data.reasons && data.reasons.join(" ")) || "Failed to delete account.";
          errorAlert.style.display = "block";
        } else {
          successAlert.innerText = data.message || "Your account and personal data have been successfully deleted.";
          successAlert.style.display = "block";
          document.getElementById("deleteForm").reset();
        }
      } catch (err) {
        errorAlert.innerText = "Network error. Please check your connection and try again.";
        errorAlert.style.display = "block";
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Permanently Delete My Account";
      }
    }
  </script>
</body>
</html>`;

router.get(["/delete-account", "/account-deletion"], (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(DELETION_HTML);
});

export default router;
