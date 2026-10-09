export class SmsDeliveryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

async function callTwilio(to: string, from: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const username = apiKeySid || accountSid;
  const password = apiKeySid ? apiKeySecret : authToken;

  if (!accountSid?.startsWith("AC") || !username || !password || !from) {
    throw new SmsDeliveryError("SMS_NOT_CONFIGURED", "SMS verification is not configured. Check the Twilio account credentials and restart the local launcher.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    signal: AbortSignal.timeout(15000),
  });

  const result = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const code = String(result.code || res.status);
    // Provider messages can contain phone numbers; log only the error code.
    console.error("[Twilio] API error code:", code);
    const messages: Record<string, string> = {
      "21606": "SMS sender is not an SMS-capable number belonging to this Twilio account. Configure a Twilio sender, not the customer's phone number.",
      "21608": "Twilio cannot send to this recipient until trial/compliance restrictions are resolved. Verify the test recipient or complete the production account setup.",
      "20003": "Twilio rejected the account credentials. Check the Account SID and API key/secret.",
      "21408": "SMS delivery to this country is disabled in Twilio. Check messaging geographic permissions.",
    };
    throw new SmsDeliveryError(`TWILIO_${code}`, messages[code] || "The SMS provider could not send the verification code. Check the provider messaging logs.");
  }

  return result;
}

export async function sendSms(to: string, body: string) {
  let from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "";
  from = from.replace(/[\s()-]/g, "");
  if (!from) throw new SmsDeliveryError("SMS_NOT_CONFIGURED", "SMS verification is not configured. Set TWILIO_FROM_NUMBER to an SMS-capable number belonging to your Twilio account, then restart the local launcher.");
  if (!from.startsWith("+")) from = "+" + from.replace(/\D/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(from)) throw new SmsDeliveryError("SMS_INVALID_SENDER", "The SMS sender must be a valid international Twilio number.");

  // Catch the local setup mistake before attempting to send a paid SMS.
  if (process.env.NODE_ENV === "development") {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
    const username = apiKeySid || accountSid;
    const password = (apiKeySid ? process.env.TWILIO_API_KEY_SECRET : process.env.TWILIO_AUTH_TOKEN)?.trim();
    if (!accountSid?.startsWith("AC") || !username || !password) throw new SmsDeliveryError("SMS_NOT_CONFIGURED", "Twilio credentials are incomplete. Check the API .env and restart the local launcher.");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` },
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as { incoming_phone_numbers?: { phone_number: string; capabilities?: { sms?: boolean } }[] };
    if (!response.ok) throw new SmsDeliveryError("SMS_ACCOUNT_LOOKUP_FAILED", "Could not validate the Twilio sender. Check the API key's phone-number read permissions and account credentials.");
    if (!data.incoming_phone_numbers?.some(number => number.phone_number === from && number.capabilities?.sms)) {
      throw new SmsDeliveryError("SMS_SENDER_NOT_PROVISIONED", "SMS is unavailable: this Twilio account has no SMS-capable sender matching TWILIO_FROM_NUMBER. Use a number from Twilio Active Numbers, not your personal phone number.");
    }
  }

  console.log("[Twilio] Sending verification SMS");
  const result = await callTwilio(to, from, body);
  console.log("[Twilio] SMS sent, SID:", result.sid);
  return result;
}

export async function sendWhatsApp(to: string, body: string) {
  const rawFrom = process.env.TWILIO_WHATSAPP_FROM || "+14155238886";
  const from = "whatsapp:" + rawFrom.replace(/^whatsapp:/, "");

  // If a test number is configured, redirect ALL WhatsApp messages to it
  const testOverride = process.env.WHATSAPP_TEST_NUMBER;
  const actualTo = testOverride ? testOverride : to;
  const toWa = "whatsapp:" + actualTo.replace(/^whatsapp:/, "");

  if (testOverride) {
    console.log(`[Twilio] WhatsApp TEST MODE — redirecting ${to} → ${toWa}`);
  } else {
    console.log(`[Twilio] Sending WhatsApp to ${toWa}`);
  }

  try {
    const result = await callTwilio(toWa, from, body);
    console.log("[Twilio] WhatsApp sent, SID:", result.sid);
    return result;
  } catch (err) {
    console.error("[Twilio] WhatsApp send failed (non-fatal):", err);
    return null;
  }
}
