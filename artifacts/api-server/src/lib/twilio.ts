async function callTwilio(to: string, from: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio credentials not configured.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });

  const result = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    console.error("[Twilio] API error:", JSON.stringify(result));
    throw new Error((result.message as string) || `Twilio API error ${res.status}`);
  }

  return result;
}

export async function sendSms(to: string, body: string) {
  let from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "";
  from = from.trim();
  if (!from.startsWith("+")) from = "+" + from.replace(/\D/g, "");

  console.log(`[Twilio] Sending SMS to ${to}`);
  const result = await callTwilio(to, from, body);
  console.log("[Twilio] SMS sent, SID:", result.sid);
  return result;
}

export async function sendWhatsApp(to: string, body: string) {
  const rawFrom = process.env.TWILIO_WHATSAPP_FROM || "+14155238886";
  const from = "whatsapp:" + rawFrom.replace(/^whatsapp:/, "");
  const toWa = "whatsapp:" + to.replace(/^whatsapp:/, "");

  console.log(`[Twilio] Sending WhatsApp to ${toWa}`);
  try {
    const result = await callTwilio(toWa, from, body);
    console.log("[Twilio] WhatsApp sent, SID:", result.sid);
    return result;
  } catch (err) {
    console.error("[Twilio] WhatsApp send failed (non-fatal):", err);
    return null;
  }
}
