import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { db, pool } from "@workspace/db";
import {
  usersTable,
  whatsappMessagesTable,
  whatsappPreferencesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const url = new URL(process.env.DATABASE_URL || "");
assert(
  ["localhost", "127.0.0.1"].includes(url.hostname),
  "Verifier requires a local database",
);
const schema = `verify_whatsapp_${randomUUID().replaceAll("-", "")}`;
const originalFetch = globalThis.fetch;
let server: Server | undefined;
let providerCalls = 0;
let delivery: "ok" | "permanent" | "transient" | "network" = "ok";
let templateStatus = "APPROVED";
let templateBody =
  "Hello from DollDime! {{1}} Reply STOP to stop WhatsApp messages.";
const testEnv = {
  ADMIN_EMAIL: "whatsapp-verifier@example.invalid",
  ADMIN_PASSWORD: randomUUID(),
  ADMIN_SESSION_SECRET: randomUUID(),
  META_WHATSAPP_ACCESS_TOKEN: "mock-token",
  META_WHATSAPP_PHONE_NUMBER_ID: "123456789",
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: "987654321",
  META_APP_SECRET: randomUUID(),
  META_WHATSAPP_VERIFY_TOKEN: randomUUID(),
  META_WHATSAPP_PROMO_TEMPLATE_NAME: "dolldime_offer",
  META_WHATSAPP_TEMPLATE_LANGUAGE: "en_US",
  NODE_ENV: "development",
};
Object.assign(process.env, testEnv);

try {
  // Structure/indexes only: no customer data or foreign keys to public data.
  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of [
    "users",
    "whatsapp_preferences",
    "whatsapp_campaigns",
    "whatsapp_messages",
  ]) {
    await pool.query(
      `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
    );
  }
  pool.options.options = `-csearch_path=${schema}`;
  await pool.query(`SET search_path TO "${schema}"`);
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    const address = String(input);
    if (!address.startsWith("https://graph.facebook.com/"))
      return originalFetch(input, init);
    if (address.includes("/message_templates?"))
      return Response.json({
        data: [
          {
            name: "dolldime_offer",
            language: "en_US",
            status: templateStatus,
            category: "MARKETING",
            components: [{ type: "BODY", text: templateBody }],
          },
        ],
      });
    if (address.endsWith("/123456789?fields=id,display_phone_number"))
      return Response.json({
        id: "123456789",
        display_phone_number: "+12015550199",
      });
    assert(
      address.endsWith("/123456789/messages"),
      "Unexpected Meta endpoint; real Meta calls are prohibited",
    );
    providerCalls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.template.name, "dolldime_offer");
    assert.equal(body.template.language.code, "en_US");
    assert.equal(body.type, "template");
    if (delivery === "network")
      throw new TypeError("Mock network response lost");
    if (delivery === "permanent")
      return Response.json({ error: { code: 132000 } }, { status: 400 });
    if (delivery === "transient")
      return Response.json({ error: { code: 130429 } }, { status: 429 });
    return Response.json({ messages: [{ id: `wamid.mock.${providerCalls}` }] });
  }) as typeof fetch;
  const { default: app } = await import("../src/app");
  const { deliverOne } = await import("../src/lib/whatsapp-worker");
  const users = await db
    .insert(usersTable)
    .values([
      {
        name: "Subscribed A",
        email: "a@example.invalid",
        phone: "+12015550100",
        passwordHash: "unused",
      },
      {
        name: "Subscribed B",
        email: "b@example.invalid",
        phone: "+12015550101",
        passwordHash: "unused",
      },
      {
        name: "No consent",
        email: "c@example.invalid",
        phone: "+12015550102",
        passwordHash: "unused",
      },
      {
        name: "Inactive",
        email: "d@example.invalid",
        phone: "+12015550103",
        passwordHash: "unused",
        isActive: false,
      },
      {
        name: "Invalid phone",
        email: "e@example.invalid",
        phone: "not-a-phone",
        passwordHash: "unused",
      },
    ])
    .returning();
  for (let i = 0; i < users.length; i++)
    await db
      .insert(whatsappPreferencesTable)
      .values({
        userId: users[i].id,
        marketing: i !== 2,
        orderUpdates: true,
        marketingOptedAt: new Date(),
      });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  const request = async (
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    authenticated = true,
  ) => {
    const response = await fetch(`${origin}/api/admin${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: (await response.json()) as any,
      headers: response.headers,
    };
  };
  assert.equal(
    (await request("/whatsapp/summary", undefined, "GET", false)).status,
    401,
  );
  assert.equal(
    (await request("/whatsapp/campaigns", {}, "POST", false)).status,
    401,
  );
  const login = await request("/auth/login", {
    email: testEnv.ADMIN_EMAIL,
    password: testEnv.ADMIN_PASSWORD,
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  delete process.env.META_WHATSAPP_ACCESS_TOKEN;
  assert.equal(
    (await request("/whatsapp/summary")).data.connection.ready,
    false,
  );
  const payload = (ids = [users[0].id]) => ({
    campaignId: randomUUID(),
    title: "Verifier campaign",
    offer: "Ten percent off this Sunday",
    audience: "selected",
    recipientIds: ids,
  });
  assert.equal((await request("/whatsapp/campaigns", payload())).status, 503);
  process.env.META_WHATSAPP_ACCESS_TOKEN = testEnv.META_WHATSAPP_ACCESS_TOKEN;
  const connected = await request("/whatsapp/summary?refresh=true");
  assert.equal(connected.data.marketingSubscribers, 2);
  assert.equal(connected.data.connection.ready, true);
  assert(
    !JSON.stringify(connected.data).includes(
      testEnv.META_WHATSAPP_ACCESS_TOKEN,
    ),
    "Server secrets must not reach admin",
  );
  assert.equal((await request("/whatsapp/audience")).data.length, 2);
  templateStatus = "PENDING";
  assert.equal((await request("/whatsapp/campaigns", payload())).status, 503);
  templateStatus = "APPROVED";
  templateBody = "Offer {{1}} plus {{2}}";
  assert.equal((await request("/whatsapp/campaigns", payload())).status, 503);
  templateBody =
    "Hello from DollDime! {{1}} Reply STOP to stop WhatsApp messages.";
  for (const user of users.slice(2))
    assert.equal(
      (await request("/whatsapp/campaigns", payload([user.id]))).status,
      400,
    );
  assert.equal(
    (
      await request("/whatsapp/campaigns", {
        ...payload(),
        offer: "Invalid\nnew line",
      })
    ).status,
    400,
  );
  const campaign = payload([users[0].id, users[1].id]);
  const concurrent = await Promise.all([
    request("/whatsapp/campaigns", campaign),
    request("/whatsapp/campaigns", campaign),
  ]);
  assert.deepEqual(
    concurrent.map((result) => result.status).sort(),
    [200, 201],
  );
  assert.equal(
    (
      await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.campaignId, campaign.campaignId))
    ).length,
    2,
  );
  assert.equal(
    (
      await request("/whatsapp/campaigns", {
        ...campaign,
        offer: "Different promotion content",
      })
    ).status,
    409,
  );
  assert.equal((await request("/whatsapp/campaigns", campaign)).status, 200);
  const all = { ...payload(), audience: "all", recipientIds: [] };
  assert.equal((await request("/whatsapp/campaigns", all)).data.queued, 2);
  assert.equal(
    (await request(`/whatsapp/campaigns/${all.campaignId}/cancel`, {})).data
      .cancelled,
    2,
  );
  const queued = await db
    .select()
    .from(whatsappMessagesTable)
    .where(eq(whatsappMessagesTable.campaignId, campaign.campaignId));
  const first = queued.find((row) => row.userId === users[0].id)!;
  const second = queued.find((row) => row.userId === users[1].id)!;
  await deliverOne(first.id);
  assert.equal(
    (
      await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.id, first.id))
    )[0].status,
    "accepted",
  );
  const sid = `wamid.mock.${providerCalls}`;
  const webhook = async (value: unknown, signed = true) => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: {
                  phone_number_id: testEnv.META_WHATSAPP_PHONE_NUMBER_ID,
                },
                ...(value as object),
              },
            },
          ],
        },
      ],
    });
    const signature = createHmac("sha256", testEnv.META_APP_SECRET)
      .update(body)
      .digest("hex");
    return fetch(`${origin}/api/whatsapp/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": `sha256=${signed ? signature : "0".repeat(64)}`,
      },
      body,
    });
  };
  assert.equal(
    (await webhook({ statuses: [{ id: sid, status: "read" }] }, false)).status,
    403,
  );
  assert.equal(
    (await webhook({ statuses: [{ id: sid, status: "read" }] })).status,
    200,
  );
  await webhook({ statuses: [{ id: sid, status: "sent" }] });
  await webhook({ statuses: [{ id: sid, status: "failed" }] });
  assert.equal(
    (
      await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.id, first.id))
    )[0].status,
    "read",
  );
  await webhook({
    messages: [{ from: users[1].phone!.slice(1), text: { body: "STOP" } }],
  });
  const [preferences] = await db
    .select()
    .from(whatsappPreferencesTable)
    .where(eq(whatsappPreferencesTable.userId, users[1].id));
  assert.equal(preferences.marketing, false);
  assert.equal(preferences.orderUpdates, false);
  assert.equal(
    (
      await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.id, second.id))
    )[0].status,
    "cancelled",
  );
  const makeMessage = async () => {
    const body = payload();
    assert.equal((await request("/whatsapp/campaigns", body)).status, 201);
    return (
      await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.campaignId, body.campaignId))
    )[0];
  };
  const optedOut = await makeMessage();
  await db
    .update(whatsappPreferencesTable)
    .set({ marketing: false })
    .where(eq(whatsappPreferencesTable.userId, users[0].id));
  const callsBefore = providerCalls;
  await deliverOne(optedOut.id);
  assert.equal(
    providerCalls,
    callsBefore,
    "Consent is rechecked before contacting Meta",
  );
  assert.equal(
    (
      await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.id, optedOut.id))
    )[0].status,
    "cancelled",
  );
  await db
    .update(whatsappPreferencesTable)
    .set({ marketing: true })
    .where(eq(whatsappPreferencesTable.userId, users[0].id));
  const earlyCallback = await makeMessage();
  await db
    .update(whatsappMessagesTable)
    .set({ status: "sending" })
    .where(eq(whatsappMessagesTable.id, earlyCallback.id));
  await webhook({
    statuses: [
      {
        id: "wamid.mock.early",
        status: "delivered",
        biz_opaque_callback_data: `dolldime:${earlyCallback.id}`,
      },
    ],
  });
  assert.equal(
    (
      await db
        .select()
        .from(whatsappMessagesTable)
        .where(eq(whatsappMessagesTable.id, earlyCallback.id))
    )[0].status,
    "delivered",
    "Early webhook is correlated with its queue row",
  );
  for (const [mode, expected] of [
    ["network", "uncertain"],
    ["permanent", "failed"],
    ["transient", "queued"],
  ] as const) {
    const row = await makeMessage();
    delivery = mode;
    await deliverOne(row.id);
    const [updated] = await db
      .select()
      .from(whatsappMessagesTable)
      .where(eq(whatsappMessagesTable.id, row.id));
    assert.equal(updated.status, expected);
    assert(updated.providerErrorCode);
    if (mode === "transient") {
      delivery = "ok";
      await db
        .update(whatsappMessagesTable)
        .set({ nextAttemptAt: new Date(Date.now() - 1000) })
        .where(eq(whatsappMessagesTable.id, row.id));
      await deliverOne(row.id);
      assert.equal(
        (
          await db
            .select()
            .from(whatsappMessagesTable)
            .where(eq(whatsappMessagesTable.id, row.id))
        )[0].status,
        "accepted",
      );
    }
  }
  const history = await request("/whatsapp/campaigns");
  assert.equal(history.status, 200);
  assert(history.data.length >= 5);
  const details = await request(
    `/whatsapp/campaigns/${campaign.campaignId}/messages`,
  );
  assert.equal(details.data.length, 2);
  assert.equal(
    details.data.find((row: any) => row.id === first.id).status,
    "read",
  );
  console.log(
    "PASS: protected admin routes, setup gating, approved templates, consent, audiences, atomic/idempotent campaigns, cancellation, signed delivery updates, STOP, permanent/transient/network failures. All Meta calls mocked; no customer messages sent.",
  );
} finally {
  globalThis.fetch = originalFetch;
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
