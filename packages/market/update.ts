import { Vault } from "../database/vault";
import { fetchQuote, holdingValue, unitsForValue } from "./index";
export async function updateMarketValues(
  vault: Vault,
  key: string,
  actor: string,
  device: string,
  ids?: string[],
) {
  const holdings = vault.repo
    .rows("investment")
    .filter(
      (i) =>
        (i.mode === "market" ||
          ((!i.symbol || i.name.toUpperCase() === i.symbol.toUpperCase()) &&
            ["ETF", "Equity", "Stocks", "Mutual fund"].includes(i.kind) &&
            /^[A-Z][A-Z0-9.\-]{0,9}$/.test(i.name))) &&
        (ids ? ids.includes(i.id) : i.autoUpdate || i.mode !== "market"),
    );
  const errors: string[] = [];
  let updated = 0;
  for (const snapshot of holdings) {
    try {
      if (
        snapshot.quoteFetchedAt &&
        Date.parse(snapshot.quoteFetchedAt) > Date.now() - 15 * 60_000
      )
        continue;
      const q = await fetchQuote(
        snapshot.symbol || snapshot.name,
        key,
        snapshot.exchange ?? "",
      );
      if (q.currency !== snapshot.currency)
        throw Error(
          "Quote currency differs from this holding; edit its currency first",
        );
      if (snapshot.quoteAsOf && q.asOf < snapshot.quoteAsOf)
        throw Error("The provider returned an older price");
      // Existing ticker-only entries have a saved current amount but no units. Estimate
      // units from that current amount at the quote used for this repair, then track them.
      const legacyTicker = snapshot.mode !== "market";
      const quantity = legacyTicker
        ? unitsForValue(snapshot.value, q.price)
        : snapshot.quantity;
      const value = holdingValue(quantity, q.price);
      await vault.mutate((r) => {
        const latest = r.get("investment", snapshot.id);
        if (!latest || JSON.stringify(latest) !== JSON.stringify(snapshot))
          throw Error("Holding changed while the price was loading; try again");
        const name =
          q.name.toUpperCase() !== q.symbol.toUpperCase()
            ? q.name
            : latest.name;
        if (
          latest.name === name &&
          latest.value === value &&
          latest.priceDecimal === q.price &&
          latest.quoteAsOf === q.asOf
        )
          return;
        r.write(
          "investment",
          {
            ...latest,
            value,
            name,
            mode: "market",
            autoUpdate: true,
            quantity,
            symbol: q.symbol,
            exchange: q.exchange,
            price: holdingValue("1", q.price),
            priceDecimal: q.price,
            quoteAsOf: q.asOf,
            quoteFetchedAt: q.fetchedAt,
            date: new Date().toLocaleDateString("en-CA"),
          },
          actor,
          device,
          snapshot.id,
        );
      });
      updated++;
    } catch (e) {
      errors.push(`${snapshot.name}: ${(e as Error).message}`);
    }
  }
  return { updated, errors };
}
