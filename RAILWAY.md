# Deploy Tandem privately on Railway

This setup serves the phone-ready Tandem app and its encrypted sync relay from one Railway service, with PostgreSQL on Railway's private network. Cloudflare Access restricts the web app to named email addresses. Tandem also verifies Cloudflare's signed assertion at the app origin, so opening Railway's generated URL cannot skip the web access policy. The sync API retains its own member passwords and per-device tokens, allowing the native desktop app to keep syncing directly.

## 1. Deploy the Railway services

Create a new Railway project, add a PostgreSQL service, then deploy this repository as a service from its root directory. `railway.json` selects `infrastructure/Dockerfile` and sets the `/health` check for you. Keep the PostgreSQL service's public networking disabled. Reference its private `DATABASE_URL` from the app service.

Before the first deploy, add these app-service variables in Railway's Variables panel:

| Variable                   | Value                                                                   |
| -------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`             | Reference the PostgreSQL service's private `DATABASE_URL`               |
| `MEMBER1_PASSWORD`         | Unique random password of at least 12 characters                        |
| `MEMBER2_PASSWORD`         | A different unique random password of at least 12 characters            |
| `CF_ACCESS_TEAM_DOMAIN`    | Your Cloudflare Access team domain, e.g. `example.cloudflareaccess.com` |
| `CF_ACCESS_AUD`            | The application audience tag from the Cloudflare Access application     |
| `CF_ACCESS_ALLOWED_EMAILS` | Comma-separated exact email addresses permitted to use the app          |
| `APP_ORIGIN`               | The exact public HTTPS origin, e.g. `https://money.example.com`         |

Mark passwords as secrets. Do not put the household vault passphrase, Twelve Data key, or database URL in source control or in a `VITE_` variable. The two member passwords are for sync; the vault passphrase is only held by household members. Existing member passwords are not rotated by changing Railway variables after the first database initialization; reset them separately if needed.

The container fails closed at startup in production unless all Cloudflare Access variables are present. `/health` remains available for Railway's health check. Static app pages require a valid signed Cloudflare assertion whose verified email matches the exact allowlist. Relay API routes use the existing member/password and device-token authentication.

## 2. Connect your domain and restrict access

In Cloudflare, add your domain and configure its DNS with Cloudflare. In Cloudflare Zero Trust, create an Access application of type **Self-hosted** for the exact app hostname. Add a **one-time PIN** identity provider and an **Allow** policy that includes only the exact email addresses of the people you want to admit. Access denies everyone else by default. Copy the app's **AUD tag** and the team domain into the Railway variables above.

In Railway, add the same custom domain to the app service's public networking. Railway shows the DNS records required for its origin; configure those records as directed for a Cloudflare-proxied hostname. Confirm the custom domain routes through Access. Keep the Railway-generated hostname available as an origin; the application-level assertion check denies access to its app pages unless a valid token for your Access app is present.

Set `APP_ORIGIN` to the final custom URL, without a trailing slash. Redeploy after adding or changing variables. Do not share the link until the custom hostname prompts for Cloudflare email verification and the Railway hostname returns `401` for `/` while `/health` returns `200`.

## 3. Create and sync the household

Open the protected link on the first phone, create the household and choose a long vault passphrase. Export an encrypted `.tandem` backup and transfer it privately to the second member. Restore that backup on the second phone using the same vault passphrase, then connect sync in Settings using the member number and corresponding Railway password. The app can then be installed to the phone's home screen.

Keep Railway PostgreSQL private, enable Railway database backups, and keep independent encrypted Tandem exports. Revoking a device stops future sync but cannot erase a local copy already stored on that device. Household contents are encrypted before sync; Railway stores only encrypted event and backup envelopes.

## Local CLI deployment

After linking the repository directory to the Railway project, use `railway up`. The checked-in configuration selects the Dockerfile and health check. Set the same variables from the Railway dashboard or with `railway variables set`; do not pass passwords as command-line arguments where shell history may retain them.

References: [Railway config as code](https://docs.railway.com/config-as-code/reference), [Railway PostgreSQL](https://docs.railway.com/databases/postgresql), [Railway custom domains](https://docs.railway.com/networking/domains/working-with-domains), [Cloudflare Access setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
