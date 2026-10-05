import { beforeAll, it, expect } from "vitest";
import { initSQL, Repository } from "../packages/database/repository";
import { Vault } from "../packages/database/vault";
import type { Envelope } from "../packages/database/crypto";
import { save, remove } from "../packages/database/commands";
beforeAll(() => initSQL());
const actor = crypto.randomUUID(),
  device = crypto.randomUUID();
const storage = () => {
  let data: Envelope | null = null;
  return {
    read: async () => data,
    write: async (e: Envelope) => {
      data = e;
    },
  };
};
it("SQLite migration, two-device merge, duplicate prevention and explicit conflict resolution", () => {
  const a = new Repository(),
    b = new Repository();
  const first = a.write("category", { name: "Groceries" }, actor, device);
  b.append(first);
  const edit = a.write(
    "category",
    { name: "Food" },
    actor,
    device,
    first.recordId,
  );
  const other = b.write(
    "category",
    { name: "Shopping" },
    actor,
    crypto.randomUUID(),
    first.recordId,
  );
  a.append(other);
  a.append(other);
  b.append(edit);
  expect(a.events()).toHaveLength(3);
  expect(a.conflicts()).toHaveLength(1);
  expect(a.rows("category")).toHaveLength(0);
  const resolved = a.write(
    "category",
    { name: "Food & groceries" },
    actor,
    device,
    first.recordId,
    false,
    true,
  );
  b.append(resolved);
  expect(b.rows("category")[0].name).toBe("Food & groceries");
  expect(a.events()).toHaveLength(4);
});
it("encrypted persistence, offline reopen, backup restore and corrupt backup rejection", async () => {
  const s = storage();
  const v = await Vault.create("long test passphrase", s);
  await v.mutate((r) => {
    r.write(
      "household",
      {
        name: "Test",
        currency: "USD",
        users: [
          { id: actor, name: "One" },
          { id: crypto.randomUUID(), name: "Two" },
        ],
      },
      actor,
      device,
    );
    r.write("category", { name: "Secret groceries" }, actor, device);
  });
  expect(JSON.stringify(await s.read())).not.toContain("Secret");
  const reopened = await Vault.unlock("long test passphrase", s);
  expect(reopened.repo.rows("category")[0].name).toBe("Secret groceries");
  const backup = await v.backup();
  const restored = await Vault.create("long test passphrase", storage());
  await restored.restore(backup, "long test passphrase");
  expect(restored.repo.events()).toHaveLength(2);
  await expect(
    restored.restore(
      { ...backup, data: backup.data.slice(0, -8) + "AAAAAAAA" },
      "long test passphrase",
    ),
  ).rejects.toThrow();
  await expect(Vault.unlock("wrong password long", s)).rejects.toThrow();
}, 20000);
it("failed persistence rolls back memory", async () => {
  const v = await Vault.create("long test passphrase", {
    read: async () => null,
    write: async () => {
      throw Error("Disk full");
    },
  });
  await expect(
    v.mutate((r) => r.write("category", { name: "Lost" }, actor, device)),
  ).rejects.toThrow("Disk full");
  expect(v.repo.events()).toHaveLength(0);
});
it("income, expense, edit, soft deletion and currency validation", () => {
  const r = new Repository();
  r.write(
    "household",
    {
      name: "Home",
      currency: "USD",
      users: [
        { id: actor, name: "One" },
        { id: crypto.randomUUID(), name: "Two" },
      ],
    },
    actor,
    device,
  );
  const account = save(
    r,
    "account",
    {
      name: "Bank",
      currency: "USD",
      date: "2026-10-01",
      owner: "shared",
      kind: "bank",
      opening: 100000,
    },
    actor,
    device,
  );
  const input = {
    name: "Salary",
    kind: "income" as const,
    currency: "USD" as const,
    date: "2026-10-02",
    owner: "shared",
    amount: 200000,
    account: account.recordId,
    person: actor,
    destination: "",
    target: "",
    category: "Salary",
    merchant: "",
    notes: "",
    interest: 0,
    rate: 1000000,
    destinationAmount: 0,
    occurrence: "",
    attachment: "",
    items: "",
  };
  const t = save(r, "transaction", input, actor, device);
  save(
    r,
    "transaction",
    { ...input, amount: 210000 },
    actor,
    device,
    t.recordId,
  );
  expect(r.rows("transaction")[0].amount).toBe(210000);
  expect(() =>
    save(r, "transaction", { ...input, currency: "EUR" }, actor, device),
  ).toThrow();
  remove(r, "transaction", t.recordId, actor, device);
  expect(r.rows("transaction")).toHaveLength(0);
  expect(r.events().filter((e) => e.recordId === t.recordId)).toHaveLength(3);
});

it("historical valuations and currency rates do not change earlier months", async () => {
  const { historicalPosition } = await import("../packages/finance/history");
  const { schemas } = await import("../packages/types");
  const r = new Repository();
  const initial = schemas.investment.parse({
    name: "Portfolio",
    kind: "ETF",
    contributed: 1000000,
    value: 1000000,
    currency: "EUR",
    date: "2026-01-01",
  });
  const inv = r.write("investment", initial, actor, device);
  const rate = r.write(
    "rate",
    { name: "EUR", value: 1100000, date: "2026-01-01" },
    actor,
    device,
  );
  r.write(
    "investment",
    { ...initial, value: 1200000, date: "2026-10-01" },
    actor,
    device,
    inv.recordId,
  );
  r.write(
    "rate",
    { name: "EUR", value: 1200000, date: "2026-10-01" },
    actor,
    device,
    rate.recordId,
  );
  expect(historicalPosition(r.events(), "2026-09-30", "USD").investments).toBe(
    1100000,
  );
  expect(historicalPosition(r.events(), "2026-10-02", "USD").investments).toBe(
    1440000,
  );
});
it("the same scheduled occurrence has the same identity on separate devices", async () => {
  const { occurrenceRecordId } = await import("../packages/database/commands");
  const occurrence = crypto.randomUUID() + ":2026-10-02";
  const idA = await occurrenceRecordId(occurrence),
    idB = await occurrenceRecordId(occurrence);
  expect(idA).toBe(idB);
  const a = new Repository(),
    b = new Repository();
  const e1 = a.write("category", { name: "Payment by A" }, actor, device, idA);
  const e2 = b.write(
    "category",
    { name: "Payment by B" },
    actor,
    crypto.randomUUID(),
    idB,
  );
  a.append(e2);
  b.append(e1);
  expect(a.conflicts()).toHaveLength(1);
  expect(b.conflicts()).toHaveLength(1);
});
it("investment accounts validate currency and cannot be deleted while holding investments", () => {
  const r = new Repository();
  const a = r.write(
    "account",
    {
      name: "Broker",
      kind: "other",
      opening: 0,
      currency: "USD",
      date: "2026-01-01",
      owner: "shared",
    },
    actor,
    device,
  );
  const investment = {
    name: "ETF",
    kind: "ETF" as const,
    account: a.recordId,
    value: 10000,
    contributed: 10000,
    currency: "USD" as const,
    date: "2026-01-01",
    owner: "shared",
    platform: "",
    valuedTransactions: [],
    fees: 0,
    quantity: "",
    price: 0,
    notes: "",
  };
  expect(() =>
    save(r, "investment", { ...investment, currency: "EUR" }, actor, device),
  ).toThrow("currency");
  const i = save(r, "investment", investment, actor, device);
  expect(r.get("investment", i.recordId)?.account).toBe(a.recordId);
  expect(r.get("account", a.recordId)?.opening).toBe(0);
  expect(() => remove(r, "account", a.recordId, actor, device)).toThrow(
    "holds investments",
  );
});
