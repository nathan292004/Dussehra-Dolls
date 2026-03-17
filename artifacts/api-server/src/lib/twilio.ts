export async function sendSms(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  let from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "";

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables."
    );
  }

  // Ensure sender number is in E.164 format
  from = from.trim();
  if (!from.startsWith("+")) {
    from = "+" + from.replace(/\D/g, "");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  console.log(`[Twilio] Sending OTP SMS to ${to} from ${from}`);

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

  console.log("[Twilio] SMS sent, SID:", result.sid);
  return result;
}
