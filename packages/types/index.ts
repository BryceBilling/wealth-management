import { z } from "zod";
export const currencies = ["USD", "ZAR", "ZWL", "GBP", "EUR"] as const;
export const money = z.number().int().safe();
const base = z.object({
  name: z.string().min(1).max(200),
  owner: z.string().default("shared"),
  currency: z.enum(currencies).default("USD"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const schemas = {
  household: z.object({
    name: z.string().min(1),
    currency: z.enum(currencies),
    users: z
      .array(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
      .length(2),
  }),
  account: base.extend({
    kind: z.enum(["bank", "cash", "savings", "mobile", "other"]),
    opening: money,
  }),
  transaction: base.extend({
    kind: z.enum([
      "income",
      "expense",
      "transfer",
      "bill",
      "debt",
      "savings",
      "investment",
      "withdrawal",
      "dividend",
    ]),
    amount: money.positive(),
    funding: z.enum(["account", "external"]).optional(),
    account: z.union([z.string().uuid(), z.literal("")]),
    destination: z.string().default(""),
    target: z.string().default(""),
    category: z.string().default("Other"),
    merchant: z.string().default(""),
    notes: z.string().default(""),
    person: z.string(),
    interest: money.nonnegative().default(0),
    rate: z.number().int().positive().default(1000000),
    destinationAmount: money.nonnegative().default(0),
    occurrence: z.string().default(""),
    attachment: z.string().default(""),
    items: z.string().default(""),
  }),
  bill: base.extend({
    amount: money.positive(),
    account: z.string(),
    category: z.string().default("Utilities"),
    frequency: z.enum([
      "once",
      "daily",
      "weekly",
      "monthly",
      "yearly",
      "custom",
    ]),
    interval: z.number().int().min(1).default(1),
    reminder: z.number().int().min(0).default(1),
  }),
  debt: base.extend({
    lender: z.string().default(""),
    original: money.nonnegative(),
    balance: money.nonnegative(),
    apr: z.number().int().min(0).max(100000),
    payment: money.positive(),
    paymentDay: z.number().int().min(1).max(31).default(1),
    minimum: money.nonnegative().default(0),
    interestType: z.enum(["monthly", "manual"]).default("monthly"),
    term: z.number().int().nonnegative().default(0),
  }),
  investment: base.extend({
    account: z.string().uuid().optional(),
    mode: z.enum(["interest", "market", "manual"]).optional(),
    annualRate: z.number().int().min(0).max(100000).optional(),
    symbol: z.string().max(80).optional(),
    exchange: z.string().max(100).optional(),
    autoUpdate: z.boolean().optional(),
    quoteAsOf: z.string().optional(),
    quoteFetchedAt: z.string().optional(),
    priceDecimal: z.string().optional(),
    kind: z.enum([
      "Stocks",
      "Equity",
      "Bonds",
      "Fixed deposit",
      "ETF",
      "Mutual fund",
      "Crypto",
      "Property",
      "Business",
      "Other",
    ]),
    platform: z.string().default(""),
    valuedTransactions: z.array(z.string()).default([]),
    contributed: money.nonnegative(),
    value: money.nonnegative(),
    fees: money.nonnegative().default(0),
    quantity: z.string().default(""),
    price: money.nonnegative().default(0),
    notes: z.string().default(""),
  }),
  goal: base.extend({
    target: money.positive(),
    current: money.nonnegative(),
    account: z.string().default(""),
    description: z.string().default(""),
    kind: z.enum(["savings", "general"]).default("savings"),
  }),
  budget: base.extend({
    income: money.nonnegative(),
    expenses: money.nonnegative(),
    category: z.string().default("All"),
  }),
  recurring: base.extend({
    funding: z.enum(["account", "external"]).optional(),
    kind: z.enum(["income", "expense", "debt", "savings", "investment"]),
    amount: money.positive(),
    account: z.string(),
    target: z.string().default(""),
    destination: z.string().default(""),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
    interval: z.number().int().min(1).default(1),
  }),
  category: z.object({ name: z.string().min(1) }),
  rate: z.object({
    name: z.enum(currencies),
    value: z.number().int().positive(),
    date: z.string(),
  }),
  attachment: z.object({
    name: z.string(),
    mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
    data: z.string().max(7000000),
  }),
};
export type EntityType = keyof typeof schemas;
export type Data = { [K in EntityType]: z.infer<(typeof schemas)[K]> };
export type Row<K extends EntityType = EntityType> = Data[K] & {
  id: string;
  type: K;
};
export const eventSchema = z.object({
  id: z.string().uuid(),
  recordId: z.string().uuid(),
  type: z.enum(Object.keys(schemas) as [EntityType, ...EntityType[]]),
  parents: z.array(z.string().uuid()).max(100),
  actor: z.string().uuid(),
  device: z.string().uuid(),
  createdAt: z.string().datetime(),
  deleted: z.boolean(),
  data: z.unknown(),
});
export type Event = z.infer<typeof eventSchema>;
export function validateEvent(input: unknown): Event {
  const e = eventSchema.parse(input);
  schemas[e.type].parse(e.data);
  return e;
}
