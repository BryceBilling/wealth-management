# Tandem on iPhone and Android

Tandem has an installable mobile web app with bottom navigation, touch controls, home-screen icons and encrypted offline storage. Once installed and cached, you can open the app, unlock your vault and record changes without internet. Online quotes and synchronization resume when connected. There is no App Store or Play Store package.

## Install on your phone

1. Open your household’s **private HTTPS app address** while connected to its network or VPN.
2. **iPhone:** use Safari → Share → Add to Home Screen. Enable Open as Web App if offered. **Android:** use Chrome → menu → Install app or Add to Home screen.
3. Open Tandem from its new home-screen icon. Install first, then create or restore your household inside the installed app; browser and installed-app storage may be separate.
4. For your existing household, export an encrypted backup from Settings on your Mac and restore it on the phone with the same passphrase. Choose the correct member in Settings. Do not create a second household for the same finances.
5. Connect the phone to the private relay in Settings for ongoing sync. The app defaults to its own HTTPS origin. Allow the app to finish caching before testing airplane mode.

## Use your own domain and Railway

Your Railway account can host the app and sync together behind your .com subdomain, using Railway-managed HTTPS. Firebase is not needed. See [RAILWAY.md](RAILWAY.md). With this option your phone does not need a private VPN; local vault encryption and server login protect your household data. A domain and destination service still need to be selected.

## Set up the private address

A live phone address has **not** been deployed with this source bundle. `localhost` on a phone refers to the phone itself, and the Mac ZIP cannot install on a phone.

The supplied server serves both `dist/` and the sync API. Follow the private Docker/PostgreSQL setup in [README.md](README.md), set `APP_ORIGIN` to your exact HTTPS app origin, and use the included Caddy TLS profile on your private host. Configure your private DNS/VPN so both phones can reach that host. For Caddy’s internal CA, install and trust its root certificate on each device through the operating system’s certificate settings. Do not bypass certificate errors. Restrict access to your household’s devices.

For an existing Node/PostgreSQL private host: run `npm ci`, `npm run build`, then `npm run server` with the documented database/member environment variables. Put the server behind your trusted private HTTPS reverse proxy. The mobile web archive in `release/Tandem-mobile-web.zip` contains `dist/` for an existing private static host; ongoing sync also needs the relay. Keep the same HTTPS origin on updates so the phone retains its vault.

## Share with your partner

Open **More → Share Tandem** on a phone, or **Share Tandem** in the desktop sidebar. The HTTPS app address is suggested automatically on the web. Choose WhatsApp, Copy link or More ways. Your partner chooses whether to send/open the message; Tandem never sends a message automatically. They need access to the same private network.

Sharing the app does not share its records. Send an encrypted backup separately for initial pairing and communicate its passphrase separately. On Mac, Save app to share creates an installer ZIP for another Apple Silicon Mac.

## Investments on mobile

Enter Amount, choose an investment type, type a ticker or company/fund name, and select its account. Connect your Twelve Data API key once under Online prices. A unique ticker match fills the name and shows its exchange, price and quote date; otherwise select the intended listing from the results.

Amount means today's holding value. The app estimates shares from this amount and the returned price; for precise tracking, expand Set exact shares / units and enter the actual quantity from your broker. This prevents mistaking original purchase cost for current value. The saved share quantity is then held constant as prices change. Refresh runs on opening Investments, reconnection and every 15 minutes while that page is open; the page refresh control also refreshes market values within the local free-plan budget. It does not run when the app is closed. Tandem reserves at most 3 requests per minute and 300 per UTC day per installation, shared across tabs and reloads, and caches quotes for 15 minutes. Two Tandem installations together reserve no more than 6/minute and 600/day for the same key. Use that key only in Tandem because other API clients share the provider’s quota. Provider coverage, quotas and delays apply. Offline or failed requests keep your last saved value. Unmatched investments can still be saved manually, with that limitation shown in the form.

## Storage and verification

Keep encrypted backups outside the phone. Clearing site/app data, private browsing and storage eviction can remove the local vault. Installation and standalone behavior depend on browser and OS support. Automated touch and offline workflows cover Chromium and WebKit at a 390px phone viewport; installation on physical iPhone/Android hardware and your private certificate setup still need device verification.
