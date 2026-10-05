# Market refresh and free allowance — 5 October 2026

Latest verification: 32 unit/storage/calculation checks pass; 2 database-dependent tests skip without the dedicated PostgreSQL test database. Nine browser workflows pass (plus one previously recorded skipped PostgreSQL sync test); the full suite had one transient onboarding page-load timeout, which passed on immediate isolated rerun. Targeted checks include VOO name repair, persisted request counting, page refresh, ticker pricing, and Chromium/WebKit mobile flows. Twelve Data calls are mocked in browser tests. No live VOO data or API key was used. The actual Basic-plan limits and reset details were checked against the [Twelve Data pricing page](https://twelvedata.com/pricing) and [credits guide](https://support.twelvedata.com/en/articles/5615854-credits).

Each local installation reserves at most 3 API credits/minute and 300/UTC day per API key, across tabs and reloads. The current quote and symbol-search endpoints each cost 1 credit; if response headers report a higher actual weight, the budget records it before allowing later requests. The budget counts failed requests before dispatch. A 15-minute quote cache, request deduplication, one-symbol-only quotes and endpoint allow-list reduce consumption. Provider limit or auth errors pause calls for the UTC day. Two Tandem installations stay below the published Basic limits if the same key is used only in Tandem; usage from other apps/services is outside the local counters. Basic plan errors do not automatically upgrade a key.

Ticker-only legacy manual ETF/equity entries are repaired at refresh: the existing saved amount estimates units using the matched quote, the holding becomes price-tracked, and subsequent value is units × price. Refreshing within 15 minutes reuses the persisted quote time and does not call Twelve Data again. The page-level refresh button also runs sync, updates market values within cache/budget limits, and rerenders the current page.

# Market lookup follow-up — 5 October 2026

Current verification: 26 unit/storage/calculation tests and 8 browser workflows passed. Two PostgreSQL integration tests and the database-backed sync browser test were skipped (database not running). TypeScript, formatting, production build and the Mac bundle build passed.

Ticker input now searches the provider and fetches a quote, including the company/fund name and exchange. Unit coverage checks amount-to-shares estimation with exact decimal rounding. The mocked O browser workflow resolves Realty Income, estimates 10 shares from a $600 value at $60, revalues at $66 and $72, preserves quantity when editing, accepts 12 exact shares, and preserves the last value when offline. These are synthetic test prices, not live quotes. No user API key was available for a live O request; earlier live AAPL demo verification is described below. Users must connect their own Twelve Data key in the app.

# Investment naming follow-up — 5 October 2026

Both add entry points now include Investment name alongside Amount, Investment type and Account. Browser checks cover two different named ETFs in one account, editing a name, account subtotals and saving/reopening a named holding offline in Chromium and WebKit. Names can be entered freely; previously used names are suggested. No external instrument catalog is required.

# Verification — 5 October 2026

Follow-up: Quick add → Investment now opens the same Amount / Investment type / Account form as Investments → Add investment. Targeted browser coverage verifies both entry points and preserves Add money for contributions to existing holdings.

The investment form now contains exactly Amount, Investment type and Account. Current checks passed: TypeScript, formatting, production build, 25 unit/storage/calculation tests and 7 desktop/mobile browser workflows. Two PostgreSQL integration tests and one two-device sync browser test were skipped because the test database was not running; previous database verification is recorded below.

The revised browser tests verify multiple holdings total by account, moving an investment between accounts, editing its amount, preserving cash balances and net worth without double counting, and three-field entry on Chromium and WebKit phone viewports. Unit checks reject account currency mismatch and deletion of accounts with linked investments. Existing holdings remain readable without an account and appear under Unassigned until edited.

The Mac app is rebuilt with the new form. Native interaction and physical phone installation limitations below still apply.

# Verification — 2 October 2026

## Passed

- `npm run check` (strict TypeScript)
- `npm run format:check` (Prettier)
- `npm run build` (production browser app and offline service worker)
- `npm run desktop:build -- --bundles app` (macOS Apple Silicon Tauri bundle)
- 26 Vitest tests, including real PostgreSQL 16.11 integration
- 8 Playwright browser workflows using Chromium 153.0.8010.12 and WebKit 26.6 (the WebKit offline check passed in a targeted rerun after replacing failing offline emulation with an actually stopped origin server)

The browser suite creates a real household, verifies $12,000 starting net worth, records income, groceries, debt, direct savings and direct investment additions offline, updates an investment valuation, restarts offline, verifies all balances, exports a backup, restores it into a separate browser profile, checks mobile width, records/edits a bill with audit history, verifies single-account savings, advances the clock past automatic sync without navigation, and prevents two tabs from overwriting one another.

Mobile touch tests check installation instructions, manifest/icons, 390px layout, bottom navigation, investment entry, sharing and encrypted vault reopening. Chromium uses browser offline mode; WebKit reopens with its origin server stopped. Physical home-screen installation is still unverified. Investment tests check decimal precision, annual interest estimates, mocked live quote updates, failed quote preservation and share-link validation. A real Twelve Data demo AAPL quote was also retrieved using the actual quote client; other instruments and paid-plan coverage were not live-tested. Static server checks verify mobile assets are served while server/config files remain inaccessible.

A separate end-to-end browser test pairs two device profiles through an encrypted backup. Both enter transactions offline, reconnect through the real Fastify/PostgreSQL relay, and converge on all four transactions and the same $2,925 balance.

Integration tests additionally exercise duplicate push requests, network failure after the server commits, safe retry, explicit concurrent-edit resolution, encrypted server backup restoration, revoked devices, expired tokens, invalid credentials, and malformed requests. Calculation tests include loan amortization, rounding, currency conversion, historical rates and valuations, transfers, direct contributions, budgets, recurrence, savings, and investment gains.

## Platform checks not claimed

The macOS application was built and launched. Native UI inspection was not authorized by Computer Use, so native window interactions and the native Save dialog have not been verified here. Browser workflows use the same React, SQLite, encryption, and sync implementation, but are not a substitute for native platform QA.

Docker Desktop is absent; Docker Compose, Caddy private TLS, and the scheduled age-encrypted PostgreSQL backup container were not executed. The actual relay was tested with an isolated local PostgreSQL 16.11 instance. Production private-network configuration still requires your own host, credentials and certificates.

Windows/Linux builds, native biometrics, mobile native packages, signing/notarization, and closed-app reminder delivery are not verified or supplied. No public deployment was performed.

The Railway CLI can list the connected account’s projects. No Tandem service has been linked or deployed, no database has been provisioned there, and no domain/DNS change has been made. RAILWAY.md describes the prepared deployment path. The Mac installer export and WhatsApp OS-opening commands compile, but native interactions remain unverified.
