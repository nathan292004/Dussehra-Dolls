import test from 'node:test';
import assert from 'node:assert/strict';
import { sendSms } from '../artifacts/api-server/src/lib/twilio.ts';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
test.after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });
process.env.NODE_ENV = 'development';
process.env.TWILIO_ACCOUNT_SID = 'ACtest';
process.env.TWILIO_API_KEY_SID = 'SKtest';
process.env.TWILIO_API_KEY_SECRET = 'test-secret';
delete process.env.TWILIO_PHONE_NUMBER;

test('missing sender is rejected without contacting Twilio', async () => {
  delete process.env.TWILIO_FROM_NUMBER;
  globalThis.fetch = async () => { assert.fail('must not contact provider'); };
  await assert.rejects(sendSms('+15005550006', 'Test'), { code: 'SMS_NOT_CONFIGURED' });
});

test('personal/non-provisioned sender never attempts an SMS', async () => {
  process.env.TWILIO_FROM_NUMBER = '+1 500 555 0006';
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /IncomingPhoneNumbers/);
    assert.notEqual(options?.method, 'POST');
    return Response.json({ incoming_phone_numbers: [] });
  };
  await assert.rejects(sendSms('+15005550007', 'Test'), { code: 'SMS_SENDER_NOT_PROVISIONED' });
});

test('owned SMS sender is normalized and a provider failure has an actionable code', async () => {
  process.env.TWILIO_FROM_NUMBER = '+1 (500) 555-0006';
  let sends = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('IncomingPhoneNumbers')) {
      return Response.json({ incoming_phone_numbers: [{ phone_number: '+15005550006', capabilities: { sms: true } }] });
    }
    sends++;
    assert.equal(new URLSearchParams(String(options?.body)).get('From'), '+15005550006');
    return Response.json({ code: 21608, message: 'restricted' }, { status: 400 });
  };
  await assert.rejects(sendSms('+15005550007', 'Test'), { code: 'TWILIO_21608' });
  assert.equal(sends, 1);
});

test('owned sender and successful delivery request succeed', async () => {
  process.env.TWILIO_FROM_NUMBER = '+15005550006';
  globalThis.fetch = async url => String(url).includes('IncomingPhoneNumbers')
    ? Response.json({ incoming_phone_numbers: [{ phone_number: '+15005550006', capabilities: { sms: true } }] })
    : Response.json({ sid: 'SMtest', status: 'queued' });
  const result = await sendSms('+15005550007', 'Test');
  assert.equal(result.status, 'queued');
});
