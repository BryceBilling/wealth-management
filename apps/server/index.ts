import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { createServer, provision } from "./app";
const allowedEmails = (process.env.CF_ACCESS_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.CF_ACCESS_TEAM_DOMAIN ||
    !process.env.CF_ACCESS_AUD ||
    !allowedEmails.length ||
    allowedEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
)
  throw new Error(
    "Set CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, and valid CF_ACCESS_ALLOWED_EMAILS to enable the required Cloudflare Access origin check",
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
  await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
);
await provision(pool, [
  process.env.MEMBER1_PASSWORD ?? "",
  process.env.MEMBER2_PASSWORD ?? "",
]);
const staticDir = fileURLToPath(new URL("../../dist/", import.meta.url));
const app = await createServer(pool, {
  origin: process.env.APP_ORIGIN,
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  access:
    process.env.CF_ACCESS_TEAM_DOMAIN && process.env.CF_ACCESS_AUD
      ? {
          teamDomain: process.env.CF_ACCESS_TEAM_DOMAIN,
          audience: process.env.CF_ACCESS_AUD,
          allowedEmails,
        }
      : undefined,
});
await app.listen({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "127.0.0.1",
});
console.log(
  "Tandem private relay listening on " + app.server.address()?.toString(),
);
