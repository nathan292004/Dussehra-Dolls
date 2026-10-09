# DollDime local setup (Windows)

The application is inside this `Dussehra-Dolls` directory. It is a pnpm workspace:

| Folder | Purpose |
| --- | --- |
| `artifacts/mobile` | Expo SDK 54 / React Native customer mobile app |
| `artifacts/admin` | React / Vite admin, inventory, orders and vendor portal |
| `artifacts/api-server` | Express API shared by mobile and admin |
| `artifacts/mockup-sandbox` | Separate Replit UI mockup project |
| `lib/db` | PostgreSQL schema and Drizzle tooling |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | API specification and shared generated libraries |
| `scripts`, `attached_assets` | Utilities and reference assets |

The mobile app is React Native, despite the Flutter wording in `replit.md`.

## Launch

Open PowerShell in this directory and run:

```powershell
.\Start-Local.ps1
```

This starts local PostgreSQL on `127.0.0.1:5433`, applies the schema, then launches the API, admin and Expo. Keep the terminal open.

- Admin: http://localhost:5173/admin/
- API health: http://localhost:3001/api/readyz
- Expo: http://localhost:8081

For a browser preview of the customer app:

```powershell
.\Start-Local.ps1 --web
```

For a physical phone, use the normal launch without `--web`, install Expo Go compatible with SDK 54, and scan Expo's QR code. The phone and computer must share Wi-Fi. The launcher selects a computer IPv4 address for the API. If you have a VPN or multiple adapters, set the correct address first:

```powershell
$env:EXPO_PUBLIC_API_URL = 'http://YOUR_COMPUTER_WIFI_IP:3001/api'
.\Start-Local.ps1
```

If Windows Firewall prompts, allow the development servers on your private network. A browser preview does not validate native phone behavior. Native APK builds and App Store distribution require their separate platform/build setup; the exported EAS configuration still contains placeholder project details.

Run only one launcher at a time so the development server ports remain available.

The customer browser preview stays within a centered 430px phone-width frame on
wide screens and fills smaller screens. The admin remains a separate website.

### Sample shop inventory

Twelve illustrated god dolls have been added to the local database for testing.
They use `DEMO-GOLU-` serial numbers, a `Demo` tag, and descriptions identifying
prices, stock and artwork as placeholders. Existing products are preserved.
To add them to a fresh local database (or rerun safely without duplicates):

```powershell
& ./.tools/node_modules/node-win-x64/bin/node.exe scripts/seed-demo-products.mjs
```

The script only accepts the local database on port 5433. The sample PNG artwork
is in `artifacts/api-server/uploads/demo` and works in browser and native previews.

Press Ctrl+C to stop the apps. PostgreSQL keeps running and preserves data. Stop it separately with:

```powershell
.\Start-Local.ps1 --stop-db
```

## Installed tools and dependencies

All ten workspace packages are installed, including the mockup and shared libraries. Project-local tools in the ignored `.tools` folder are Node.js 24.21.0, pnpm 10.32.1, and PostgreSQL 16.14. PostgreSQL Windows binaries are provided by [embedded-postgres](https://github.com/leinelissen/embedded-postgres). No system-wide PostgreSQL service is needed.

Use the local pnpm wrapper:

```powershell
.\pnpm.ps1 run typecheck
.\pnpm.ps1 --filter @workspace/admin run build
.\pnpm.ps1 --filter @workspace/api-server run build
```

To reinstall on this Windows x64 computer, with Node/npm available and internet access:

```powershell
.\Setup-Local.ps1
```

## Environment and data

The launcher creates an ignored `artifacts/api-server/.env` containing a generated local database password. PostgreSQL data is stored in `.local/postgres-data`. Preserve this directory to keep your local inventory and orders.

The Replit export includes source code and three uploaded images, but no database dump. The new local database starts empty. Add products through the admin portal or obtain a PostgreSQL export from the original Replit database to recover existing records.

Set real `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the API `.env` to enable payments. Without them, the API starts and payment endpoints return an unavailable response. Set Twilio credentials using `artifacts/api-server/.env.example` to enable registration OTPs, SMS and WhatsApp. These service secrets were not included in the export and cannot be installed as npm dependencies.

## Portability fixes

### OTP configuration troubleshooting

After editing the API `.env`, restart `Start-Local.ps1`; the running API keeps
the environment it received at launch. `TWILIO_FROM_NUMBER` must be an SMS-capable
sender listed in that Twilio account's Active Numbers. A personal mobile number
or verified recipient is not an SMS sender. Run this read-only diagnostic:

```powershell
& ./.tools/node_modules/node-win-x64/bin/node.exe scripts/check-sms-config.mjs
```

It reports provisioning and credentials errors without exposing credentials or
full phone numbers, and does not send a message. Development OTP failures now
show an actionable configuration message; production uses a generic unavailable
message. Failed sends do not leave an OTP record that blocks immediate retries.

Customers register themselves; the registration route creates their database
record and wallet automatically. A managed provider such as Clerk can replace
the password/OTP and session implementation, but requires a configured Clerk
application and verified backend sessions linked to the existing customer IDs.

## Local implementation details

Removed Replit's native-binary exclusions, replaced Linux-only installation and development commands, added local admin defaults and API proxying, and added an explicit mobile API URL. Normalized Drizzle's schema path for Windows. Fixed existing TypeScript route and button export errors found during validation. Replit mobile launch settings are retained when Replit environment variables are present.

Local uploads use the same configured API origin so the phone can load inventory images. Added the missing Expo Babel preset and aligned native dependencies with SDK 54.

The original API production build still warns about `import.meta` in its CommonJS output, and the original mobile deployment build expects a Replit domain. Use the local development launcher for this setup; deployment configuration needs separate work.

## Validation completed

- All workspace TypeScript checks pass.
- Admin production build passes (existing bundle-size and sourcemap warnings remain).
- Expo dependency compatibility check passes.
- Customer app exports successfully for web and Android (Hermes bundle).
- Local PostgreSQL schema is created and API readiness reports database OK.
- Admin page and admin API proxy respond successfully.

A physical Android/iOS device has not been tested.
