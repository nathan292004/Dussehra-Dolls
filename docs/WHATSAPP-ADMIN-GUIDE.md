# DollDime WhatsApp promotions: owner setup and daily use

DollDime connects directly to Meta's official WhatsApp Cloud API. Twilio is used separately for registration SMS. A Twilio key does not connect WhatsApp.

## What is implemented

- Admin → WhatsApp Promotions (`/admin/promotions`, with `/admin/whatsapp` retained).
- A campaign name, a short offer, and a preview using the actual Meta template.
- Send to all subscribed active customers or selected subscribed customers. Use a subscribed team account for the first real send.
- A final review showing the audience count before queueing.
- Durable campaign history and individual delivery results: queued, sending, accepted by Meta, sent, delivered, read, failed, cancelled, or needs review.
- Cancel messages that are still queued. Messages already being sent cannot be recalled.
- The same submission request cannot accidentally create a second campaign if the browser retries.
- Opt-in is checked again before sending. STOP or UNSUBSCRIBE received through the signed webhook disables WhatsApp updates and cancels pending messages. STOP OFFERS / STOP PROMOTIONS disables marketing only.

Registration does not grant marketing permission. In the customer app, open Profile → Notifications → Offers and promotions, enable it, and save. Only those customers are eligible. Meta requires opt-in and approved templates for business-initiated messages: https://whatsappbusiness.com/policy/

## What the business owner needs to arrange

1. Open Meta Business Suite and create/select the business portfolio belonging to the company.
2. In Meta for Developers, create/select the business app and add WhatsApp. Connect it to the company's WhatsApp Business Account (WABA).
3. Add a business phone number that can be verified. Follow Meta's onboarding instructions if the number is already used in WhatsApp or WhatsApp Business; use the offered migration/coexistence process where eligible.
4. Complete the business details, display name review, verification and payment setup requested by Meta for this account. The test number and temporary developer token are for initial testing, not the production sender.
5. Create a system user in Business Settings, give it the relevant app and WhatsApp assets, and generate an access token with `whatsapp_business_messaging` and `whatsapp_business_management`. Use the longest suitable token lifetime offered and arrange renewal if it expires. Treat this token as a password.
6. Create the approved message templates below in WhatsApp Manager. Wait until the promotional template status is APPROVED and its category is MARKETING.
7. Put the credentials in the API server's private environment. They must not be placed in the mobile app, admin browser code or Git. Restart the API after editing its environment.
8. Publish the API at an HTTPS address and configure Meta's `messages` webhook. A local `localhost` URL cannot receive Meta's webhooks. A development HTTPS tunnel can be used during supervised testing; production needs a stable public URL.
9. Refresh the admin connection status, subscribe a team account in the app, choose Selected subscribers and send to that account. Check the phone and confirm delivery status before sending a real campaign.

## Values needed for the server

| Environment setting | Where it comes from / what it means |
| --- | --- |
| `META_WHATSAPP_ACCESS_TOKEN` | System user access token for the correct business assets; permission to send messages and read templates. |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Numeric sender ID shown in WhatsApp API Setup. This is not the phone number itself. |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | Numeric WABA ID shown in WhatsApp API Setup / Business Settings. This is different from the phone number ID and business portfolio ID. |
| `META_APP_SECRET` | The Meta developer app's secret under App Settings → Basic. Used to verify webhook signatures. |
| `META_WHATSAPP_VERIFY_TOKEN` | A long random value we choose and enter both on the server and in Meta's webhook setup. It is not a Meta access token. |
| `META_WHATSAPP_PROMO_TEMPLATE_NAME` | Exact approved marketing template name, for example `dolldime_offer`. |
| `META_WHATSAPP_TEMPLATE_LANGUAGE` | Exact template language, for example `en_US`. |
| `META_GRAPH_API_VERSION` | A supported Graph API version; the current application default is `v26.0`. |
| `API_PUBLIC_ORIGIN` | Public HTTPS origin of this API, for example `https://api.your-company.com`. |

The current local API has a generated webhook verify token and default template settings. The real Meta account access token, phone number ID, Business Account ID and app secret have not been provided. Having the software integration present does not mean the business sender is connected or production approved.

## Promotional template to submit to Meta

Name: `dolldime_offer` (or another name you configure on the server).

Category: MARKETING. Language: English (US), `en_US`, if that is the language you choose.

Suggested body:

> Hello from DollDime! Our latest offer: {{1}} Shop in the DollDime app. Reply STOP to stop WhatsApp messages.

Example value for variable 1:

> Enjoy 10% off our festive doll collection until Sunday.

The offer must be one line, 5–200 characters, without tabs or five consecutive spaces. The admin supports one numbered body variable `{{1}}`. Static text headers, footers and static buttons may be used; media headers, named/additional variables and dynamic buttons need additional implementation. The app checks Meta's live template status before a new campaign is queued and keeps its template name/language for that campaign. A later rejection or pause by Meta can still cause delivery failures.

Other templates already supported by the application:

| Setting | Purpose | Numbered body variables |
| --- | --- | --- |
| `META_WHATSAPP_ORDER_TEMPLATE_NAME` | Order confirmation | 1: order ID; 2: paid amount |
| `META_WHATSAPP_CHIT_TEMPLATE_NAME` | Doll plan payment | 1: customer name; 2: plan name; 3: installment amount; 4: total paid toward the plan |
| `META_WHATSAPP_WALLET_TEMPLATE_NAME` | Wallet top-up | 1: amount; 2: new balance |
| `META_WHATSAPP_REMINDER_TEMPLATE_NAME` | Installment reminder | 1: plan; 2: amount; 3: due date |

Customers separately opt in to order/payment updates and promotions. Obtain Meta approval for each template's actual content and appropriate category.

## Configure the webhook

- Callback: `https://YOUR-API-HOST/api/whatsapp/webhook`
- Verify token: exactly the server's `META_WHATSAPP_VERIFY_TOKEN`.
- Subscribe the app/WABA to the `messages` field so status updates and inbound STOP messages reach the API.
- Set `META_APP_SECRET` to the secret of the app that owns the webhook subscription.

The server validates Meta's signature before processing callbacks. Without a working webhook, accepted messages can stay in the accepted state even if the customer received them. A configured key is not proof that Meta can reach the webhook; verify with a real message and reply STOP from the test account.

## How an admin sends a campaign

1. Sign in to the admin portal and click WhatsApp Promotions.
2. Check Ready to send. If Setup required appears, open the connection checklist.
3. Give the campaign a name for the team's records.
4. Write the offer and review it in the WhatsApp preview.
5. Select All subscribed customers, or Selected subscribers and search for the recipients. The maximum is 5,000 per campaign.
6. Click Review promotion. Check the exact message and recipient count.
7. Click Queue messages. The worker submits messages in the background; queueing is not proof of delivery.
8. Open Delivery details in campaign history. Sent, delivered and read are updated through Meta's webhook. Read receipts are not guaranteed for every recipient.
9. If needed, Stop queued messages. Delivered messages cannot be recalled. If a network response was lost, Needs review prevents automatic resending of a possibly delivered promotion.

Meta can reject a message because of account limits, template status, billing, recipient availability or policy restrictions. The portal shows provider error codes. Meta charges can apply to promotional messages; current rate cards are at https://whatsappbusiness.com/products/platform-pricing/ . There is no Twilio WhatsApp subscription in this direct integration.

## Deployment and verification

Apply `lib/db/migrations/20261015_whatsapp_campaigns.sql` after the existing integrations migration. This adds campaign history and links queued messages to campaigns. Build/restart the API and build/reload admin.

The focused verifier is `artifacts/api-server/scripts/verify-whatsapp-campaigns.ts`. Run it with the API environment loaded. It requires a local database, creates an isolated temporary schema, mocks every Meta request, and removes the schema afterward. It does not contact WhatsApp recipients. It checks admin protection, connection gating, template approval, recipient consent, atomic queueing, retries of the same submission, worker behavior, signed delivery updates, STOP and cancellation. This cannot prove live Meta authorization, phone delivery, billing or webhook reachability.
