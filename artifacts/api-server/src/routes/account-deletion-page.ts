import type { Request, Response } from "express";

// The public web page Google Play requires for apps with accounts: a customer can delete their
// account without installing the app. Link it in Play Console > App content > Data safety as
// https://<api domain>/account-deletion. It uses the same rules as deleting in the app.

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function accountDeletionPage(_req: Request, res: Response) {
  const support = process.env.SUPPORT_EMAIL ? escapeHtml(process.env.SUPPORT_EMAIL) : "";
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delete your DollDime account</title>
<style>
  :root { --ink:#1a1a1a; --muted:#6b6560; --line:#ede9e3; --bg:#f0ede8; --card:#fff; --accent:#2e8b57; --danger:#b42318; --dangerbg:#fbeae6; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:520px; margin:0 auto; padding:32px 16px 48px; }
  h1 { font-size:26px; margin:0 0 8px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; margin-top:20px; }
  p, li { color:var(--muted); }
  label { display:block; font-weight:600; font-size:14px; margin:14px 0 6px; }
  input { width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; font-size:16px; background:#fafaf8; }
  input:focus { outline:2px solid var(--accent); outline-offset:1px; }
  button { margin-top:18px; width:100%; padding:13px; border:0; border-radius:10px; font-size:16px; font-weight:600; color:#fff; background:var(--ink); cursor:pointer; }
  button.danger { background:var(--danger); }
  button:disabled { opacity:.6; cursor:wait; }
  .msg { margin-top:14px; padding:12px; border-radius:10px; font-size:14px; }
  .msg.error { background:var(--dangerbg); color:var(--danger); }
  .msg.ok { background:#eaf3de; color:#2e6b1f; }
  .hidden { display:none; }
  ul { padding-left:20px; margin:8px 0 0; }
</style>
</head>
<body>
<main>
  <h1>Delete your DollDime account</h1>
  <p>You can delete your account here without the app. You'll need your phone, to receive a code, and your password.</p>

  <div class="card">
    <strong>What happens when you delete</strong>
    <ul>
      <li>Your account is closed straight away and you can no longer sign in.</li>
      <li>Your phone number becomes free to register a new account.</li>
      <li>We keep records of your orders, payments and savings plans, because the law requires businesses to keep payment and tax records.</li>
      <li>You can't delete while money is still in your wallet or savings plan, or while an order is on its way. The page will tell you if that applies.</li>
    </ul>
    ${support ? `<p>Questions? Write to <a href="mailto:${support}">${support}</a>.</p>` : ""}
  </div>

  <form id="step1" class="card" novalidate>
    <label for="phone">Registered phone number</label>
    <input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+91 98765 43210" required>
    <button type="submit">Send me a code</button>
    <div id="msg1" class="msg hidden" role="alert"></div>
  </form>

  <form id="step2" class="card hidden" novalidate>
    <label for="otp">6-digit code from the SMS</label>
    <input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
    <label for="password">Your DollDime password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit" class="danger">Delete my account</button>
    <div id="msg2" class="msg hidden" role="alert"></div>
  </form>

  <div id="done" class="card hidden" role="status">
    <strong>Your account has been deleted.</strong>
    <p>You've been signed out on every device. Thank you for shopping with DollDime.</p>
  </div>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  let phone = "";
  function show(el, text, kind, list) {
    el.className = "msg " + kind;
    el.textContent = text;
    if (list && list.length > 1) {
      const ul = document.createElement("ul");
      for (const r of list) { const li = document.createElement("li"); li.textContent = r; ul.appendChild(li); }
      el.appendChild(ul);
    }
  }
  async function post(path, body) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, data };
  }
  $("step1").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.submitter || $("step1").querySelector("button");
    phone = $("phone").value.trim();
    if (!phone) return show($("msg1"), "Please enter your phone number.", "error");
    btn.disabled = true;
    try {
      const r = await post("/api/auth/send-otp", { phone, purpose: "delete" });
      if (!r.ok) return show($("msg1"), r.data.error || "Could not send the code. Please try again.", "error");
      show($("msg1"), "We sent a code to " + phone + ".", "ok");
      $("step2").classList.remove("hidden");
      $("otp").focus();
    } catch { show($("msg1"), "Network problem. Please try again.", "error"); }
    finally { btn.disabled = false; }
  });
  $("step2").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.submitter || $("step2").querySelector("button");
    const otp = $("otp").value.trim(), password = $("password").value;
    if (!/^\\d{6}$/.test(otp)) return show($("msg2"), "Enter the 6-digit code from the SMS.", "error");
    if (!password) return show($("msg2"), "Enter your password.", "error");
    if (!confirm("Delete your DollDime account? This cannot be undone.")) return;
    btn.disabled = true;
    try {
      const r = await post("/api/auth/delete-account-web", { phone, otp, password });
      if (!r.ok) return show($("msg2"), r.data.error || "Could not delete the account.", "error", r.data.reasons);
      $("step1").classList.add("hidden"); $("step2").classList.add("hidden"); $("done").classList.remove("hidden");
    } catch { show($("msg2"), "Network problem. Please try again.", "error"); }
    finally { btn.disabled = false; }
  });
</script>
</body>
</html>`);
}
