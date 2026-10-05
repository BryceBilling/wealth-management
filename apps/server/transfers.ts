import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const claim = z.object({ token: secret, receipt: secret }).strict();
export function transferRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: preHandlerHookHandler,
  envelope: z.ZodType,
) {
  const cleanup = () =>
    pool.query("DELETE FROM transfers WHERE expires_at <= now()");
  const timer = setInterval(
    () => {
      void cleanup().catch(() => {});
    },
    15 * 60 * 1000,
  );
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
  app.addHook("onSend", async (req, reply) => {
    if (
      req.url.startsWith("/transfers") ||
      req.url.startsWith("/web-transfers")
    )
      reply
        .header("Cache-Control", "no-store")
        .header("Referrer-Policy", "no-referrer");
  });
  function management(
    prefix: string,
    authenticate: preHandlerHookHandler,
    owner: (req: any) => string,
  ) {
    app.post(
      prefix,
      {
        preHandler: authenticate,
        config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      },
      async (req: any) => {
        const input = z
          .object({ envelope, hours: z.union([z.literal(1), z.literal(24)]) })
          .strict()
          .parse(req.body);
        await cleanup();
        const token = randomBytes(32).toString("base64url"),
          id = randomUUID();
        const result = await pool.query(
          "INSERT INTO transfers(id,device_id,token_hash,envelope,expires_at,owner_key) VALUES($1,$2,$3,$4,now()+$5*interval '1 hour',$6) RETURNING expires_at",
          [
            id,
            req.device?.id ?? null,
            hash(token),
            JSON.stringify(input.envelope),
            input.hours,
            owner(req),
          ],
        );
        return { id, token, expiresAt: result.rows[0].expires_at };
      },
    );
    app.get(prefix, { preHandler: authenticate }, async (req: any) => {
      await cleanup();
      return {
        transfers: (
          await pool.query(
            "SELECT id,created_at,expires_at,completed_at,revoked_at FROM transfers WHERE owner_key=$1 ORDER BY created_at DESC",
            [owner(req)],
          )
        ).rows,
      };
    });
    app.post(
      prefix + "/revoke",
      { preHandler: authenticate },
      async (req: any, reply) => {
        const { id } = z
          .object({ id: z.string().uuid() })
          .strict()
          .parse(req.body);
        const result = await pool.query(
          "UPDATE transfers SET revoked_at=now(),envelope=NULL WHERE id=$1 AND owner_key=$2 RETURNING id",
          [id, owner(req)],
        );
        return result.rows.length
          ? { ok: true }
          : reply.code(404).send({ error: "Transfer not found" });
      },
    );
  }
  management("/transfers", auth, (req) => "device:" + req.device.id);
  management(
    "/web-transfers",
    async (req: any, reply) => {
      if (!req.accessEmail)
        return reply.code(401).send({
          error: "Sign in to your private Tandem website, then try again.",
        });
    },
    (req) => "email:" + req.accessEmail,
  );
  // These recipient endpoints also require the Cloudflare Access gate in app.ts.
  // A lease prevents simultaneous imports; retries on the same browser reuse a receipt.
  app.post("/transfers/claim", async (req, reply) => {
    const { token, receipt } = claim.parse(req.body);
    await cleanup();
    const result = await pool.query(
      `UPDATE transfers SET receipt_hash=$2,claim_until=LEAST(expires_at,now()+interval '10 minutes')
      WHERE token_hash=$1 AND expires_at>now() AND revoked_at IS NULL AND completed_at IS NULL
      AND (receipt_hash=$2 OR claim_until IS NULL OR claim_until<=now())
      RETURNING envelope`,
      [hash(token), hash(receipt)],
    );
    if (!result.rows.length)
      return reply.code(410).send({
        error:
          "This link has expired, was used or revoked, or is being imported on another device. Ask for a new link or retry in 10 minutes.",
      });
    return { envelope: result.rows[0].envelope };
  });
  app.post("/transfers/complete", async (req, reply) => {
    const { token, receipt } = claim.parse(req.body);
    const result = await pool.query(
      `UPDATE transfers SET completed_at=COALESCE(completed_at,now()),envelope=NULL
      WHERE token_hash=$1 AND receipt_hash=$2 AND expires_at>now() AND revoked_at IS NULL
      AND (completed_at IS NOT NULL OR claim_until>now()) RETURNING id`,
      [hash(token), hash(receipt)],
    );
    return result.rows.length
      ? { ok: true }
      : reply.code(410).send({
          error:
            "The link is no longer available. Your imported data is already saved.",
        });
  });
}
