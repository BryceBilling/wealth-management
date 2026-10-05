# Tandem

**Two people. One financial picture.** Private offline-first household wealth management, with a custom interlocking-arches logo in deep teal and mint. No public registration, telemetry or advertising. Optional online investment prices use Twelve Data when you connect your own API key.

The primary distribution is an installable web app hosted on Railway: use the same private HTTPS address on iPhone, Android, Mac, or Windows. Choose **Install Tandem** on the welcome screen or in Settings for device-specific instructions. New releases show **Update Tandem** when ready; updates apply when you choose, so they do not interrupt an open form. Connected devices synchronize through the encrypted relay; initial household pairing still requires an encrypted backup. See [RAILWAY.md](RAILWAY.md) for restricted-access hosting.

## Run

Node 24+ and npm are required.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:1420. Set your household name, the two members, base currency, and a long vault passphrase. Add accounts with opening balances before recording transactions. Data starts empty; there is no fabricated financial data.

For offline browser use, run the production build, open it once online, and let the service worker install:

```sh
npm run build
npm run preview
```

The browser caches app assets, including SQLite WASM, and can reopen offline. Financial API responses are not cached by the service worker. Keep the same browser profile and origin. Use the access-controlled Railway deployment for internet access; never publish an unprotected static copy. The optional native desktop build bundles its assets and needs no initial web connection.

## Desktop

Rust and the Tauri platform prerequisites are required. macOS needs Xcode command line tools. Linux needs WebKitGTK; Windows needs WebView2 and MSVC. See the [official prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm run desktop
npm run desktop:build -- --bundles app
```

On macOS the built app is at `apps/desktop/src-tauri/target/release/bundle/macos/Tandem.app`. Copy it to Applications on each Mac. The current bundle configuration targets macOS; adjust bundle targets for Windows/Linux and build on those operating systems. Native cross-platform binaries and signing are not supplied by this macOS build.

## Everyday use

- Add bank, cash, mobile money, savings and other asset accounts.
- Use Quick add for income, expense, shopping, transfer, bill, debt, savings, investment, withdrawal or dividends. Shopping needs only an amount when an account exists.
- Record bills and recurring rules as expected events. Recording a payment adds an actual transaction and marks only that occurrence paid.
- Add a debt with four fields: amount owed, who it is owed to, annual interest rate, and monthly repayment. New debts use monthly interest allocation. Existing debts and payment history are preserved. Debts support a stated monthly interest model or explicit statement interest. For variable-rate, daily-accrual or extra-payment loans, choose manual allocation. Payoff is an estimate assuming constant APR and monthly payments.
- Add an investment with **Amount**, **Investment type** (ETF, equity, bonds and more), **Investment name** (the specific fund/company or ticker), and **Account**. Investments shows subtotals by account. The selected account groups holdings; it does not fund or deduct cash. Cash balances and investment values remain separate assets, each counted once. Existing investment history is retained; older unassigned holdings can be linked by editing them. Connect your Twelve Data API key once under Online prices. Typing a ticker resolves a unique matching instrument automatically; company/fund searches offer exchange-labelled matches. Existing ticker-only entries are repaired on refresh: their saved amount estimates units at the current price, then matched holdings update using units × the latest available price. Amount is treated as today’s value to estimate units; expand Set exact shares / units to use the actual broker quantity. Refresh runs on opening Investments, on reconnection and every 15 minutes while that page stays open. Tandem caps each installation at 3 requests per minute and 300 per UTC day, caches quotes for 15 minutes and stops when the provider reports a limit. For two installs sharing a Basic key that leaves a buffer under Twelve Data’s published 8/minute and 800/day limits. Use the key only in Tandem; unrelated use of a shared key can consume its free allowance. The free Basic plan rejects requests after its allowance and does not turn into a paid plan automatically. Coverage and delays depend on the provider; failed requests preserve saved values.
- **Share Tandem** offers WhatsApp, Copy link and the phone’s share sheet. The Mac app can save its installer ZIP to send as an attachment. App sharing never includes your household vault.
- **iPhone and Android:** install the private web app on your home screen. Mobile navigation and offline vault reopening are supported. See [MOBILE.md](MOBILE.md) for installation, hosting and pairing.
- Adding savings uses one receiving account and adds new money without reducing another account. Investment contributions also add directly. Use Transfer to move existing money between accounts. Savings are real accounts. A goal earmarks a portion and does not create an extra asset.
- Budget, calendar, reports, forecast, search, ownership filters, receipt downloads and audit history work offline.
- Individual ownership is an organizational filter, not a secrecy boundary between members.
- Missing exchange rates are visibly excluded from aggregate totals. Enter rates in Settings as **one foreign currency unit = X base units**. Transaction rates are frozen; history uses dated valuation/rate revisions.

## Your domain and Railway

For an internet-accessible phone link using your own domain, see [RAILWAY.md](RAILWAY.md). The server can host both the app and sync; Firebase is not needed. No cloud deployment or DNS changes have been made.

## Private synchronization

First create the household on one device. Export an encrypted backup from Settings, transfer it privately, and restore it from the second device’s welcome screen using the same vault passphrase. This preserves the household UUID and encryption key; do not create two separate households. Restore selects the second member by default; Settings lets you select the member using this device.

The private relay uses Fastify and PostgreSQL. Exactly two server members are provisioned from environment variables; there is no registration endpoint. Server login credentials are separate from the shared vault passphrase.

```sh
cp .env.example .env
# Edit .env: use three unique long random passwords.
docker compose up -d --build
```

The API binds only `127.0.0.1:8787` on the host. PostgreSQL has no published port. For two real devices, use a private VPN/LAN and the included Caddy TLS profile, install its private CA certificate on both devices, configure `tandem.internal` in your private DNS, and firewall access to your own devices:

```sh
docker compose --profile tls up -d
```

Set APP_ORIGIN to the exact browser/app origin you use (native macOS uses `tauri://localhost`). Change the private hostname in `infrastructure/Caddyfile` to suit your network. Do not bypass certificate validation. HTTPS is enforced outside localhost by the client.

In Settings, enter the relay URL, your provisioned member/password and device name. Connect, then Sync now. Sync retries every 45 seconds while the vault is unlocked and when connectivity returns. Queued operations persist. Conflicts retain both revisions until explicitly resolved. Device tokens expire after 30 days; reconnect to renew them. Revocation prevents future sync, not access to data already on a device.

Without Docker, use an existing PostgreSQL instance:

```sh
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/tandem \
MEMBER1_PASSWORD='a unique member one password' \
MEMBER2_PASSWORD='a different member two password' npm run server
```

Server migrations and initial member provisioning run at startup. Existing hashes are never silently replaced by changed environment variables.

## Backups

Settings → **Transfer by private link** creates an encrypted snapshot link lasting 1 or 24 hours. Connect the sending device under Private synchronization first. Copy the link or share it through WhatsApp; send the vault passphrase separately. Recipients sign in through Cloudflare Access, enter the passphrase, and import directly. A new device selects its household member; an existing device unlocks first and merges only the same household. After pairing, connect synchronization on the recipient for future updates.

Links use random 256-bit tokens in the URL fragment (not query strings); the database stores only token hashes and encrypted snapshots. Recipient API endpoints require the configured Cloudflare identity. An atomic ten-minute import reservation permits retries on the same browser while blocking concurrent import claims. Successful import acknowledgment or revocation removes the stored ciphertext immediately; expired links stop working immediately and expired rows are purged on access and every 15 minutes. An interrupted acknowledgment can be retried after data is saved. Expiry/revocation cannot retract data already retrieved. Link status and revocation are available on the sending device. The transfer feature is available in the deployed web app; existing native installations need a rebuilt app to show it.

Settings → Export encrypted backup saves a versioned `.tandem` archive containing encrypted SQLite and audit history. The vault passphrase is required. Import authenticates the archive, downloads a safety backup, and merges instead of deleting existing history. Conflicts remain reviewable. Test restore on another browser profile before relying on a backup.

The optional server backup container uses `pg_dump` and `age`. Set `AGE_RECIPIENT` to an age **public** recipient and run `docker compose --profile backup up -d`. The private decryption identity must be kept offline. Retention is daily 7 days, weekly 28 days, monthly 366 days. See [BACKUP.md](BACKUP.md) for restore commands and verification.

## Data and security

SQLite runs locally in memory while unlocked. AES-256-GCM encrypted snapshots are committed atomically to IndexedDB (inside the Tauri WebView for desktop). A passphrase-derived key uses PBKDF2-SHA256, 600,000 iterations, and random salt. Financial data and relay tokens are never stored in localStorage; only the random installation UUID is. Sync payloads remain encrypted in PostgreSQL. Server passwords use Argon2id, device tokens are hashed server-side, and login requests are rate limited.

Closing or locking removes the memory key; idle lock occurs after 15 minutes. There is no password recovery backdoor. Do not clear browser/app data without a backup. See [SECURITY.md](SECURITY.md), [DATABASE.md](DATABASE.md), [SYNC.md](SYNC.md), and [ARCHITECTURE.md](ARCHITECTURE.md).

## Tests

```sh
npm test
npm run check
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Real PostgreSQL integration tests require a dedicated database URL. The test creates and drops a uniquely named schema, not your existing tables:

```sh
TEST_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/tandem_test npm test
```

When TEST_DATABASE_URL is absent, server integration tests are explicitly skipped. E2E starts a production preview on port 1420; stop any development server on that port first. Set PLAYWRIGHT_BROWSERS_PATH if browser binaries are in a nondefault location.

## Updates and troubleshooting

Export a backup before updating. Keep the app origin / identifier unchanged to retain the local vault. Run `npm ci`, checks, and production build; replace the private static assets or desktop app. Close all old app tabs after an update so the new cached version can activate.

- Wrong passphrase / corrupt backup: unlock fails without replacing data. Recover from a known backup.
- Sync unavailable: keep working offline, confirm relay URL/TLS, then reconnect expired credentials.
- Missing totals: add currency rates or resolve conflicted records.
- Storage full: a failed write rolls back and displays an error; export a backup before freeing storage.
- Browser offline fails on first visit: installation must cache the production assets first; use desktop for a fully bundled install.
- Notifications: local reminders require the app open and browser permission. No operating-system background scheduler is claimed.

## Scope and platform limits

This is a household ledger, not bank-connected software or a trading platform. Short PIN unlock and native biometric/keychain unlock are deliberately not substitutes for the vault passphrase in this build. No signed Windows/Linux/iOS/Android distributables have been tested. The included Docker/TLS deployment needs a private host, DNS, certificates and credentials; nothing is publicly deployed. Large attachment libraries increase encrypted snapshot size; attachments are limited to 4 MB each. Keep regular independent backups.

## Verified build

The tested stack is React 19.3.0, TypeScript 7.0.2, Vite 8.3.2, Tauri 2.12.1, sql.js 1.14.2, Fastify 5.12.5, Node 24.16.0, and PostgreSQL 16.11 for local integration tests (Compose specifies PostgreSQL 17). Dependencies are pinned by `package-lock.json` and `Cargo.lock`.

The macOS Apple Silicon archive is `release/Tandem-macOS-AppleSilicon.zip`. It contains the private, locally built app. Close an already-running Tandem instance and reopen the updated bundle to load the new code; the same application identifier retains its existing vault.

See [TESTING.md](TESTING.md) for the automated engine/storage/server and desktop/mobile browser checks, including real two-device synchronization, plus the precise unverified platform/deployment limits.
