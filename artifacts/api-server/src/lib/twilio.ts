import twilio from "twilio";

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found");

  const data = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=twilio`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((r) => r.json())
    .then((d) => d.items?.[0]);

  if (!data?.settings?.account_sid || !data?.settings?.api_key || !data?.settings?.api_key_secret) {
    throw new Error("Twilio not connected");
  }

  return {
    accountSid: data.settings.account_sid as string,
    apiKey: data.settings.api_key as string,
    apiKeySecret: data.settings.api_key_secret as string,
    phoneNumber: data.settings.phone_number as string,
  };
}

export async function sendSms(to: string, body: string) {
  const { accountSid, apiKey, apiKeySecret, phoneNumber } = await getCredentials();
  const client = twilio(apiKey, apiKeySecret, { accountSid });
  return client.messages.create({ to, from: phoneNumber, body });
}
