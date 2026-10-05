import staticFiles from "@fastify/static";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { hash, verify, argon2id } from "argon2";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { createAccessVerifier } from "./access";
import { transferRoutes } from "./transfers";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const envelope = z
  .object({
    version: z.literal(1),
    salt: z.string().max(64),
    iv: z.string().max(32),
    data: z.string().max(12000000),
  })
  .strict();
export async function createServer(
  pool: Pool,
  options: {
    origin?: string;
    staticDir?: string;
    access?: {
      teamDomain: string;
      audience: string;
      allowedEmails: string[];
    };
  } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 16000000 });
  await app.register(cors, {
    origin: options.origin ?? "http://127.0.0.1:1420",
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  if (options.access) {
    const verifyAccess = createAccessVerifier(options.access);
    app.addHook("onRequest", async (req, reply) => {
      const path = req.url.split("?", 1)[0];
      // Relay endpoints have their own member/device authentication; this
      // proxy gate protects the installable app shell from direct-origin use.
      if (
        path === "/health" ||
        /^\/(auth|sync|devices|backups)(\/|$)/.test(path) ||
        path === "/transfers" ||
        path === "/transfers/revoke"
      )
        return;
      const assertion = req.headers["cf-access-jwt-assertion"];
      if (
        !(await verifyAccess(
          typeof assertion === "string" ? assertion : undefined,
        ))
      )
        return reply.code(401).send({ error: "Access denied" });
    });
  }
  app.setErrorHandler((error, _req, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = error instanceof z.ZodError ? 400 : (err.statusCode ?? 500);
    reply
      .code(status)
      .send({ error: status === 500 ? "Server error" : err.message });
  });
  const auth = async (req: any, reply: any) => {
    const token = String(req.headers.authorization ?? "").replace(
      /^Bearer /,
      "",
    );
    const result = await pool.query(
      "SELECT * FROM devices WHERE token_hash=$1 AND NOT revoked AND expires_at>now()",
      [digest(token)],
    );
    if (!result.rows[0])
      return reply
        .code(401)
        .send({ error: "Device token expired or revoked. Log in again." });
    req.device = result.rows[0];
  };
  app.get("/health", async () => {
    await pool.query("SELECT 1");
    return { ok: true };
  });
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = z
        .object({
          member: z.enum(["member1", "member2"]),
          password: z.string().min(1).max(256),
          deviceId: z.string().uuid(),
          deviceName: z.string().min(1).max(100),
        })
        .parse(req.body);
      const r = await pool.query("SELECT * FROM members WHERE id=$1", [
        input.member,
      ]);
      if (
        !r.rows[0] ||
        !(await verify(r.rows[0].password_hash, input.password))
      )
        return reply.code(401).send({ error: "Invalid member or password" });
      const existing = await pool.query("SELECT * FROM devices WHERE id=$1", [
        input.deviceId,
      ]);
      if (existing.rows[0]?.revoked)
        return reply.code(403).send({
          error:
            "Device revoked. Use a new device registration after approval.",
        });
      if (existing.rows[0] && existing.rows[0].member_id !== input.member)
        return reply
          .code(403)
          .send({ error: "Device belongs to the other member" });
      const token = randomBytes(32).toString("base64url");
      await pool.query(
        `INSERT INTO devices(id,member_id,name,token_hash) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET token_hash=$4,expires_at=now()+interval '30 days'`,
        [input.deviceId, input.member, input.deviceName, digest(token)],
      );
      return { token, expiresInDays: 30 };
    },
  );
  app.get("/devices", { preHandler: auth }, async () => ({
    devices: (
      await pool.query(
        "SELECT id,member_id,name,created_at,expires_at,revoked FROM devices ORDER BY created_at",
      )
    ).rows,
  }));
  app.post("/devices/revoke", { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.body);
    await pool.query("UPDATE devices SET revoked=true WHERE id=$1", [id]);
    return { ok: true };
  });
  app.post("/sync/push", { preHandler: auth }, async (req, reply) => {
    const input = z
      .object({
        events: z.array(z.object({ id: z.string().uuid(), envelope })).max(100),
      })
      .parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(723819)");
      for (const e of input.events) {
        const result = await client.query(
          "SELECT envelope FROM events WHERE id=$1",
          [e.id],
        );
        if (result.rows[0]) {
          const old = envelope.parse(result.rows[0].envelope);
          if (JSON.stringify(old) !== JSON.stringify(e.envelope)) {
            await client.query("ROLLBACK");
            return reply.code(409).send({ error: "Event UUID collision" });
          }
        } else
          await client.query("INSERT INTO events(id,envelope) VALUES($1,$2)", [
            e.id,
            JSON.stringify(e.envelope),
          ]);
      }
      await client.query("COMMIT");
      return { accepted: input.events.map((e) => e.id) };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
  app.get("/sync/pull", { preHandler: auth }, async (req) => {
    const { cursor } = z
      .object({ cursor: z.coerce.number().int().nonnegative().safe() })
      .parse(req.query);
    const result = await pool.query(
      "SELECT seq,id,envelope FROM events WHERE seq>$1 ORDER BY seq LIMIT 101",
      [cursor],
    );
    const page = result.rows.slice(0, 100);
    return {
      events: page,
      cursor: page.length ? Number(page.at(-1).seq) : cursor,
      more: result.rows.length > 100,
    };
  });
  app.post("/backups", { preHandler: auth }, async (req: any) => {
    const e = envelope.parse(req.body);
    const id = randomUUID();
    await pool.query(
      "INSERT INTO backups(id,device_id,envelope) VALUES($1,$2,$3)",
      [id, req.device.id, JSON.stringify(e)],
    );
    return { id };
  });
  app.get("/backups", { preHandler: auth }, async () => ({
    backups: (
      await pool.query(
        "SELECT id,created_at FROM backups ORDER BY created_at DESC",
      )
    ).rows,
  }));
  app.get("/backups/:id", { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await pool.query("SELECT envelope FROM backups WHERE id=$1", [
      id,
    ]);
    return (
      r.rows[0]?.envelope ?? reply.code(404).send({ error: "Backup not found" })
    );
  });
  transferRoutes(app, pool, auth, envelope);
  if (options.staticDir) {
    await app.register(staticFiles, {
      root: options.staticDir,
      wildcard: false,
      setHeaders: (res, path) => {
        res.header("X-Content-Type-Options", "nosniff");
        res.header("Referrer-Policy", "no-referrer");
        if (
          path.endsWith("sw.js") ||
          path.endsWith("index.html") ||
          path.endsWith("manifest.webmanifest")
        )
          res.header("Cache-Control", "no-cache");
      },
    });
  }
  return app;
}
export async function provision(pool: Pool, passwords: [string, string]) {
  for (let i = 0; i < 2; i++) {
    if (passwords[i].length < 12)
      throw Error(
        "Server member passwords must contain at least 12 characters",
      );
    const existing = await pool.query("SELECT id FROM members WHERE id=$1", [
      "member" + (i + 1),
    ]);
    if (!existing.rows.length)
      await pool.query("INSERT INTO members VALUES($1,$2,$3)", [
        "member" + (i + 1),
        "Member " + (i + 1),
        await hash(passwords[i], {
          type: argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
      ]);
  }
}
