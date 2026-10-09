// Read-only Twilio diagnostics. Never prints credentials or full phone numbers.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(path.join(root, 'artifacts/api-server/.env'));
const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
const key = process.env.TWILIO_API_KEY_SID?.trim();
const username = key || sid;
const password = key ? process.env.TWILIO_API_KEY_SECRET?.trim() : process.env.TWILIO_AUTH_TOKEN?.trim();
const sender = (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').replace(/[\s()-]/g, '');
if (!sid || !username || !password) throw new Error('Twilio credentials are incomplete.');
const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=1000`, {
  headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
  signal: AbortSignal.timeout(15000),
});
const data = await response.json();
if (!response.ok) {
  console.log(JSON.stringify({ status: response.status, providerCode: data.code, error: 'Twilio account phone-number lookup failed. Check credentials and API key permissions.' }));
  process.exitCode = 1;
} else {
  const numbers = data.incoming_phone_numbers || [];
  console.log(JSON.stringify({
    configuredSenderPresent: Boolean(sender),
    configuredSenderOwnedByAccount: numbers.some(n => n.phone_number === sender),
    configuredSenderSmsCapable: numbers.some(n => n.phone_number === sender && n.capabilities?.sms),
    accountPhoneNumbers: numbers.map(n => ({ ending: n.phone_number.slice(-4), smsCapable: Boolean(n.capabilities?.sms) })),
    morePages: Boolean(data.next_page_uri),
  }));
}
