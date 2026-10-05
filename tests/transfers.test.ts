import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import {
  createHash,
  randomBytes,
  randomUUID,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { createServer } from "../apps/server/app";
const integration = process.env.TEST_DATABASE_URL ? it : it.skip;
const secret = () => randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = secret(),
  other = secret();
const device = randomUUID(),
  otherDevice = randomUUID();
const schema = "transfer_test_" + randomUUID().replaceAll("-", "");
const envelope = {
  version: 1,
  salt: "encrypted-salt",
  iv: "encrypted-iv",
  data: "opaque-encrypted-backup",
};
let pool: Pool, app: Awaited<ReturnType<typeof createServer>>;
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query("CREATE SCHEMA " + schema);
  await admin.end();
  pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: "-c search_path=" + schema,
  });
  await pool.query(
    await readFile(
      new URL("../apps/server/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query("INSERT INTO members VALUES('member1','Test','unused')");
  for (const [id, t] of [
    [device, token],
    [otherDevice, other],
  ])
    await pool.query(
      "INSERT INTO devices(id,member_id,name,token_hash) VALUES($1,'member1','Test',$2)",
      [id, hash(t)],
    );
  app = await createServer(pool);
});
afterAll(async () => {
  if (pool) {
    await app.close();
    await pool.query("DROP SCHEMA " + schema + " CASCADE");
    await pool.end();
  }
});
const post = (url: string, payload: unknown, bearer?: string) =>
  app.inject({
    method: "POST",
    url,
    payload: payload as any,
    headers: bearer ? { authorization: "Bearer " + bearer } : {},
  });
async function make(hours = 1) {
  const res = await post("/transfers", { hours, envelope }, token);
  expect(res.statusCode).toBe(200);
  return res.json();
}
integration(
  "private creation, atomic claims, retry, one successful import and ciphertext removal",
  async () => {
    expect((await post("/transfers", { hours: 1, envelope })).statusCode).toBe(
      401,
    );
    expect(
      (await post("/transfers", { hours: 72, envelope }, token)).statusCode,
    ).toBe(400);
    const transfer = await make();
    const stored = (
      await pool.query("SELECT * FROM transfers WHERE id=$1", [transfer.id])
    ).rows[0];
    expect(stored.token_hash).toBe(hash(transfer.token));
    expect(JSON.stringify(stored)).not.toContain(transfer.token);
    const a = { token: transfer.token, receipt: secret() },
      b = { token: transfer.token, receipt: secret() };
    const results = await Promise.all([
      post("/transfers/claim", a),
      post("/transfers/claim", b),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 410]);
    const winner = results[0].statusCode === 200 ? a : b;
    expect((await post("/transfers/claim", winner)).json().envelope).toEqual(
      envelope,
    );
    expect(
      (
        await post("/transfers/complete", {
          token: transfer.token,
          receipt: secret(),
        })
      ).statusCode,
    ).toBe(410);
    expect((await post("/transfers/complete", winner)).statusCode).toBe(200);
    expect((await post("/transfers/complete", winner)).statusCode).toBe(200);
    expect((await post("/transfers/claim", winner)).statusCode).toBe(410);
    expect(
      (
        await pool.query("SELECT envelope FROM transfers WHERE id=$1", [
          transfer.id,
        ])
      ).rows[0].envelope,
    ).toBeNull();
  },
);
integration(
  "expiry, device-scoped listing/revocation, abandoned claims, and no-store responses",
  async () => {
    const transfer = await make(24),
      body = { token: transfer.token, receipt: secret() };
    const response = await post("/transfers/claim", body);
    expect(response.headers["cache-control"]).toBe("no-store");
    await pool.query(
      "UPDATE transfers SET claim_until=now()-interval '1 second' WHERE id=$1",
      [transfer.id],
    );
    expect(
      (await post("/transfers/claim", { ...body, receipt: secret() }))
        .statusCode,
    ).toBe(200);
    expect((await post("/transfers/complete", body)).statusCode).toBe(410);
    const list = await app.inject({
      url: "/transfers",
      headers: { authorization: "Bearer " + other },
    });
    expect(list.json().transfers).toEqual([]);
    expect(
      (await post("/transfers/revoke", { id: transfer.id }, other)).statusCode,
    ).toBe(404);
    expect(
      (await post("/transfers/revoke", { id: transfer.id }, token)).statusCode,
    ).toBe(200);
    expect((await post("/transfers/claim", body)).statusCode).toBe(410);
    expect(
      (
        await pool.query("SELECT envelope FROM transfers WHERE id=$1", [
          transfer.id,
        ])
      ).rows[0].envelope,
    ).toBeNull();
    const expired = await make();
    await pool.query(
      "UPDATE transfers SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    expect(
      (
        await post("/transfers/claim", {
          token: expired.token,
          receipt: secret(),
        })
      ).statusCode,
    ).toBe(410);
    expect(
      (await pool.query("SELECT id FROM transfers WHERE id=$1", [expired.id]))
        .rows,
    ).toHaveLength(0);
  },
);
it("requires approved Cloudflare identity for recipient endpoints even with a link", async () => {
  const gated = await createServer({} as Pool, {
    access: {
      teamDomain: "test.cloudflareaccess.com",
      audience: "test",
      allowedEmails: ["member@example.com"],
    },
  });
  try {
    for (const path of ["claim", "complete"])
      expect(
        (
          await gated.inject({
            method: "POST",
            url: "/transfers/" + path,
            payload: { token: secret(), receipt: secret() },
          })
        ).statusCode,
      ).toBe(401);
  } finally {
    await gated.close();
  }
});

integration(
  "approved website users create links without sync and can only manage their own links",
  async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test" }],
          }),
        ),
      );
    const gated = await createServer(pool, {
      access: {
        teamDomain: "test.cloudflareaccess.com",
        audience: "test",
        allowedEmails: ["one@example.com", "two@example.com"],
      },
    });
    function headers(email: string) {
      const payload =
        Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString(
          "base64url",
        ) +
        "." +
        Buffer.from(
          JSON.stringify({
            iss: "https://test.cloudflareaccess.com",
            aud: ["test"],
            email,
            exp: Math.floor(Date.now() / 1000) + 60,
          }),
        ).toString("base64url");
      return {
        "cf-access-jwt-assertion":
          payload +
          "." +
          sign("RSA-SHA256", Buffer.from(payload), privateKey).toString(
            "base64url",
          ),
      };
    }
    try {
      const anonymous = await gated.inject({
        method: "POST",
        url: "/web-transfers",
        headers: { "cf-access-authenticated-user-email": "one@example.com" },
        payload: { hours: 1, envelope },
      });
      expect(anonymous.statusCode).toBe(401);
      const created = await gated.inject({
        method: "POST",
        url: "/web-transfers",
        headers: headers("one@example.com"),
        payload: { hours: 1, envelope },
      });
      expect(created.statusCode).toBe(200);
      const id = created.json().id;
      expect(
        (
          await gated.inject({
            url: "/web-transfers",
            headers: headers("one@example.com"),
          })
        )
          .json()
          .transfers.map((x: any) => x.id),
      ).toContain(id);
      expect(
        (
          await gated.inject({
            url: "/web-transfers",
            headers: headers("two@example.com"),
          })
        ).json().transfers,
      ).toEqual([]);
      expect(
        (
          await gated.inject({
            method: "POST",
            url: "/web-transfers/revoke",
            headers: headers("two@example.com"),
            payload: { id },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await gated.inject({
            method: "POST",
            url: "/web-transfers/revoke",
            headers: headers("one@example.com"),
            payload: { id },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await pool.query(
            "SELECT envelope,device_id FROM transfers WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({ envelope: null, device_id: null });
    } finally {
      await gated.close();
      fetchMock.mockRestore();
    }
  },
);
it("website transfer management fails closed without verified Access identity", async () => {
  const local = await createServer({} as Pool);
  try {
    expect((await local.inject({ url: "/web-transfers" })).statusCode).toBe(
      401,
    );
  } finally {
    await local.close();
  }
});
