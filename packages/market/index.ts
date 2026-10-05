import { z } from "zod";
import { marketRequest } from "./requests";
import { currencies } from "../types";
import { safe, ratio, add } from "../finance";
const decimal = z.string().regex(/^\d+(?:\.\d{1,12})?$/);
function rational(value: string) {
  decimal.parse(value);
  const [whole, fraction = ""] = value.split(".");
  return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) };
}
export function positiveQuantity(value: string) {
  return rational(value).n > 0n;
}
export function holdingValue(quantity: string, price: string) {
  const q = rational(quantity),
    p = rational(price);
  const den = q.d * p.d;
  return safe((q.n * p.n * 100n + den / 2n) / den);
}
// Estimate units from a current holding value (minor units), with 12 decimal places.
export function unitsForValue(value: number, price: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid holding amount");
  const p = rational(price);
  if (p.n <= 0n) throw Error("Price must be positive");
  const scale = 10n ** 12n,
    den = 100n * p.n;
  const units = (BigInt(value) * p.d * scale + den / 2n) / den;
  return `${units / scale}.${String(units % scale).padStart(12, "0")}`.replace(
    /\.?0+$/,
    "",
  );
}
export function interestProjection(value: number, annualRate: number) {
  const annual = ratio(value, annualRate, 10000);
  return { annual, monthly: ratio(annual, 1, 12), oneYear: add(value, annual) };
}
export type Quote = {
  symbol: string;
  name: string;
  currency: (typeof currencies)[number];
  price: string;
  asOf: string;
  fetchedAt: string;
  exchange: string;
};
const responseSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().optional(),
  currency: z.enum(currencies),
  close: decimal,
  datetime: z.string().min(10),
  exchange: z.string().optional(),
});
export async function fetchQuote(
  symbol: string,
  key: string,
  exchange = "",
): Promise<Quote> {
  if (!key.trim())
    throw Error(
      "Connect online prices once using your Twelve Data API key. Your saved values still work offline.",
    );
  if (!symbol.trim()) throw Error("Enter an investment ticker or symbol");
  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol.trim());
  url.searchParams.set("apikey", key.trim());
  if (exchange) url.searchParams.set("exchange", exchange);
  url.searchParams.set("dp", "8");
  const body = await marketRequest(url, (body) => {
    const parsed = responseSchema.safeParse(body);
    return (
      parsed.success &&
      parsed.data.symbol.toUpperCase() === symbol.trim().toUpperCase() &&
      (!exchange ||
        parsed.data.exchange?.toUpperCase() === exchange.toUpperCase()) &&
      Number(parsed.data.close) > 0
    );
  });
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success)
    throw Error(
      "The price response is incomplete or uses an unsupported currency. Saved values are unchanged.",
    );
  const q = parsed.data;
  if (q.symbol.toUpperCase() !== symbol.trim().toUpperCase())
    throw Error("The provider returned a different investment symbol");
  if (exchange && q.exchange?.toUpperCase() !== exchange.toUpperCase())
    throw Error("The provider returned a different exchange");
  if (
    !/^\d{4}-\d{2}-\d{2}/.test(q.datetime) ||
    !Number.isFinite(Date.parse(q.datetime.slice(0, 10)))
  )
    throw Error("Price date is invalid");
  if (rational(q.close).n <= 0n)
    throw Error("The provider returned an invalid zero price");
  let name = q.name?.trim() ?? "";
  if (!name || name.toUpperCase() === q.symbol.toUpperCase()) {
    const matches = await searchInvestments(q.symbol, key);
    const exact = matches.filter(
      (x) =>
        x.symbol.toUpperCase() === q.symbol.toUpperCase() &&
        x.currency === q.currency &&
        (!q.exchange || x.exchange.toUpperCase() === q.exchange.toUpperCase()),
    );
    if (exact.length === 1) name = exact[0].instrument_name;
  }
  return {
    symbol: q.symbol,
    name: name || q.symbol,
    currency: q.currency,
    price: q.close,
    asOf: q.datetime,
    fetchedAt: new Date().toISOString(),
    exchange: q.exchange ?? exchange,
  };
}
export async function searchInvestments(query: string, key: string) {
  if (!key.trim()) throw Error("Connect online prices first");
  const url = new URL("https://api.twelvedata.com/symbol_search");
  url.searchParams.set("symbol", query.trim());
  url.searchParams.set("apikey", key.trim());
  url.searchParams.set("outputsize", "8");
  const body = await marketRequest(url);
  return z
    .object({
      data: z.array(
        z.object({
          symbol: z.string(),
          instrument_name: z.string(),
          exchange: z.string(),
          currency: z.string(),
          instrument_type: z.string().optional(),
        }),
      ),
    })
    .parse(body)
    .data.filter((x) => currencies.includes(x.currency as any));
}
