import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { createServer, provision } from "../apps/server/app";
import { initSQL } from "../packages/database/repository";
import { Vault } from "../packages/database/vault";
import type { Envelope } from "../packages/database/crypto";
import { sync, request } from "../packages/sync/client";
import { save } from "../packages/database/commands";
import {
  balances,
  netWorth,
  debtBalance,
  portfolioValue,
} from "../packages/finance";
const integration = process.env.TEST_DATABASE_URL ? it : it.skip;
let pool: Pool, app: Awaited<ReturnType<typeof createServer>>, url: string;
const schema = "tandem_test_" + crypto.randomUUID().replaceAll("-", "");
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
  await provision(pool, ["member one passphrase", "member two passphrase"]);
  app = await createServer(pool);
  url = await app.listen({ host: "127.0.0.1", port: 0 });
  await initSQL();
}, 20000);
afterAll(async () => {
  if (!pool) return;
  await app.close();
  await pool.query("DROP SCHEMA " + schema + " CASCADE");
  await pool.end();
});
const store = () => {
  let data: Envelope | null = null;
  return {
    read: async () => data,
    write: async (e: Envelope) => {
      data = e;
    },
  };
};
integration(
  "two offline devices, seven transactions, duplicate and interrupted retry, encrypted relay, cursor and conflict",
  async () => {
    const actor = crypto.randomUUID(),
      partner = crypto.randomUUID(),
      deviceA = crypto.randomUUID(),
      deviceB = crypto.randomUUID();
    const a = await Vault.create("household sync passphrase", store());
    let account = "",
      savings = "",
      debt = "",
      investment = "";
    await a.mutate((r) => {
      r.write(
        "household",
        {
          name: "Private home",
          currency: "USD",
          users: [
            { id: actor, name: "Alex" },
            { id: partner, name: "Sam" },
          ],
        },
        actor,
        deviceA,
      );
      account = r.write(
        "account",
        {
          name: "Bank",
          kind: "bank",
          opening: 1000000,
          currency: "USD",
          owner: "shared",
          date: "2026-01-01",
        },
        actor,
        deviceA,
      ).recordId;
      savings = r.write(
        "account",
        {
          name: "Savings",
          kind: "savings",
          opening: 0,
          currency: "USD",
          owner: "shared",
          date: "2026-01-01",
        },
        actor,
        deviceA,
      ).recordId;
      debt = r.write(
        "debt",
        {
          name: "Loan",
          lender: "Bank",
          original: 1000000,
          balance: 1000000,
          apr: 1800,
          payment: 50000,
          paymentDay: 15,
          minimum: 0,
          term: 0,
          interestType: "monthly",
          date: "2026-01-01",
          owner: "shared",
          currency: "USD",
        },
        actor,
        deviceA,
      ).recordId;
      investment = r.write(
        "investment",
        {
          name: "ETF",
          kind: "ETF",
          platform: "Broker",
          contributed: 0,
          value: 0,
          fees: 0,
          quantity: "",
          price: 0,
          notes: "",
          valuedTransactions: [],
          date: "2026-01-01",
          owner: "shared",
          currency: "USD",
        },
        actor,
        deviceA,
      ).recordId;
    });
    const b = await Vault.create("household sync passphrase", store());
    await b.restore(await a.backup(), "household sync passphrase");
    async function add(
      v: Vault,
      who: string,
      dev: string,
      kind: any,
      amount: number,
    ) {
      await v.mutate((r) =>
        save(
          r,
          "transaction",
          {
            name: kind,
            kind,
            amount,
            account,
            destination: kind === "savings" ? savings : "",
            target:
              kind === "debt" ? debt : kind === "investment" ? investment : "",
            currency: "USD",
            owner: "shared",
            date: "2026-10-02",
            person: who,
            category: "Other",
            merchant: "",
            notes: "",
            interest: 0,
            rate: 1000000,
            destinationAmount: 0,
            occurrence: "",
            attachment: "",
            items: "",
          },
          who,
          dev,
        ),
      );
    }
    for (const [kind, amount] of [
      ["expense", 10000],
      ["income", 200000],
      ["debt", 40000],
      ["savings", 50000],
      ["investment", 25000],
    ] as const)
      await add(a, actor, deviceA, kind, amount);
    await add(b, partner, deviceB, "expense", 7500);
    await add(b, partner, deviceB, "income", 10000);
    const loginA = await request(url, "/auth/login", {
      member: "member1",
      password: "member one passphrase",
      deviceId: deviceA,
      deviceName: "A",
    });
    const loginB = await request(url, "/auth/login", {
      member: "member2",
      password: "member two passphrase",
      deviceId: deviceB,
      deviceName: "B",
    });
    const ca = { url, token: loginA.token, device: deviceA },
      cb = { url, token: loginB.token, device: deviceB };
    await sync(a, ca);
    await sync(b, cb);
    await sync(a, ca);
    expect(a.repo.rows("transaction")).toHaveLength(7);
    expect(b.repo.rows("transaction")).toHaveLength(7);
    expect(a.repo.pending()).toHaveLength(0);
    expect(
      balances(a.repo.rows("account"), a.repo.rows("transaction")),
    ).toEqual({ [account]: 1077500, [savings]: 50000 });
    expect(
      debtBalance(a.repo.rows("debt")[0], a.repo.rows("transaction")),
    ).toBe(975000);
    expect(netWorth([1077500, 50000, 25000], [975000])).toBe(177500);
    expect(
      portfolioValue(a.repo.rows("investment")[0], a.repo.rows("transaction")),
    ).toBe(25000);
    const stored = (await pool.query("SELECT * FROM events")).rows;
    expect(JSON.stringify(stored)).not.toContain("Private home");
    const wire = { id: stored[0].id, envelope: stored[0].envelope };
    await request(url, "/sync/push", { events: [wire] }, ca.token);
    await request(url, "/sync/push", { events: [wire] }, ca.token);
    expect(
      (await pool.query("SELECT count(*) FROM events")).rows[0].count,
    ).toBe("12");
    await a.mutate((r) =>
      r.write("category", { name: "After interruption" }, actor, deviceA),
    );
    const original = globalThis.fetch;
    let interrupted = false;
    globalThis.fetch = async (input, init) => {
      const result = await original(input, init);
      if (String(input).includes("/sync/push") && !interrupted) {
        interrupted = true;
        throw Error("Connection interrupted after server committed");
      }
      return result;
    };
    try {
      await expect(sync(a, ca)).rejects.toThrow("Connection interrupted");
    } finally {
      globalThis.fetch = original;
    }
    expect(a.repo.pending()).toHaveLength(1);
    await sync(a, ca);
    await sync(b, cb);
    expect(b.repo.rows("category")).toHaveLength(1);
    const record = a.repo.rows("category")[0];
    await a.mutate((r) =>
      r.write("category", { name: "A edit" }, actor, deviceA, record.id),
    );
    await b.mutate((r) =>
      r.write("category", { name: "B edit" }, partner, deviceB, record.id),
    );
    await sync(a, ca);
    await sync(b, cb);
    await sync(a, ca);
    expect(a.repo.conflicts()).toHaveLength(1);
    expect(b.repo.conflicts()).toHaveLength(1);
    await a.mutate((r) =>
      r.write(
        "category",
        { name: "Resolved" },
        actor,
        deviceA,
        record.id,
        false,
        true,
      ),
    );
    await sync(a, ca);
    await sync(b, cb);
    expect(b.repo.rows("category")[0].name).toBe("Resolved");
    const backup = await request(url, "/backups", await a.backup(), ca.token);
    const restored = await request(
      url,
      "/backups/" + backup.id,
      undefined,
      ca.token,
    );
    const fresh = await Vault.create("household sync passphrase", store());
    await fresh.restore(restored, "household sync passphrase");
    expect(fresh.repo.rows("transaction")).toHaveLength(7);
    await request(url, "/devices/revoke", { id: deviceB }, ca.token);
    await expect(sync(b, cb)).rejects.toThrow("revoked");
    await expect(
      request(url, "/auth/login", {
        member: "member2",
        password: "member two passphrase",
        deviceId: deviceB,
        deviceName: "B",
      }),
    ).rejects.toThrow("revoked");
    await pool.query(
      "UPDATE devices SET expires_at=now()-interval '1 day' WHERE id=$1",
      [deviceA],
    );
    await expect(sync(a, ca)).rejects.toThrow("expired");
  },
  30000,
);
integration(
  "invalid login, unauthenticated access and corrupt requests are rejected",
  async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        member: "member1",
        password: "incorrect",
        deviceId: crypto.randomUUID(),
        deviceName: "x",
      },
    });
    expect(response.statusCode).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/devices" })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { member: "member3" },
        })
      ).statusCode,
    ).toBe(400);
  },
);
