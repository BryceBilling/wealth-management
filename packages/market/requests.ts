// Counts are shared atomically across tabs, survive reloads, and contain no API key or holdings.
export type Budget = {
  day: string;
  count: number;
  recent: number[];
  blockedUntil: number;
};
export const MINUTE_LIMIT = 3,
  DAY_LIMIT = 300;
export function reserveBudget(
  previous: Budget | undefined,
  now: number,
): Budget {
  const day = new Date(now).toISOString().slice(0, 10);
  const b =
    previous && previous.day >= day
      ? previous
      : { day, count: 0, recent: [], blockedUntil: 0 };
  if (b.blockedUntil > now)
    throw Error(
      "Online prices paused to protect your free allowance. Saved values are unchanged.",
    );
  const recent = b.recent.filter((t) => t > now - 60_000);
  if (b.count >= DAY_LIMIT)
    throw Error(
      "Free-plan daily safety limit reached (300). Prices resume after midnight UTC; saved values are unchanged.",
    );
  if (recent.length >= MINUTE_LIMIT)
    throw Error(
      "Free-plan minute safety limit reached (3). Wait a minute before refreshing; saved values are unchanged.",
    );
  return {
    day: b.day,
    count: b.count + 1,
    recent: [...recent, now],
    blockedUntil: b.blockedUntil,
  };
}
const memoryBudgets = new Map<string, Budget>();
async function changeBudget(
  id: string,
  change: (previous: Budget | undefined) => Budget,
) {
  // Node is used by calculation tests; the shipped browser/native WebView uses durable IndexedDB.
  if (typeof window === "undefined") {
    memoryBudgets.set(id, change(memoryBudgets.get(id)));
    return;
  }
  if (!globalThis.indexedDB)
    throw Error("Online prices paused: usage storage is unavailable.");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("tandem-market-budget", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("budgets");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("budgets", "readwrite"),
      store = tx.objectStore("budgets");
    const req = store.get(id);
    let error: unknown;
    req.onsuccess = () => {
      try {
        store.put(change(req.result), id);
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(error ?? tx.error ?? Error("Usage storage failed"));
    };
  });
}
async function recordAdditionalCredits(id: string, credits: number) {
  if (!Number.isSafeInteger(credits) || credits <= 0) return;
  const now = Date.now(),
    day = new Date(now).toISOString().slice(0, 10);
  const midnight = Date.parse(day) + 86_400_000;
  await changeBudget(id, (previous) => {
    const b = previous ?? { day, count: 0, recent: [], blockedUntil: 0 };
    const recent = b.recent.filter((t) => t > now - 60_000);
    const minuteExceeded = recent.length + credits > MINUTE_LIMIT;
    const dailyExceeded = b.count + credits > DAY_LIMIT;
    return {
      day: b.day,
      count: Math.min(DAY_LIMIT, b.count + credits),
      recent: [...recent, ...Array(Math.min(credits, DAY_LIMIT)).fill(now)],
      blockedUntil: dailyExceeded
        ? midnight
        : minuteExceeded
          ? now + 60_000
          : b.blockedUntil,
    };
  });
}
const pending = new Map<string, Promise<any>>();
const cache = new Map<string, { expires: number; body: any }>();
export async function marketRequest(
  url: URL,
  cacheable: (body: any) => boolean = () => true,
) {
  if (
    url.origin !== "https://api.twelvedata.com" ||
    !["/quote", "/symbol_search"].includes(url.pathname)
  )
    throw Error("Market endpoint is not permitted");
  if (
    url.pathname === "/quote" &&
    /[,;]/.test(url.searchParams.get("symbol") ?? "")
  )
    throw Error("Look up one ticker at a time");
  const hash = async (s: string) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
      ),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  const id = await hash(url.searchParams.get("apikey") ?? ""),
    requestId = await hash(url.toString());
  const cached = cache.get(requestId);
  if (cached && cached.expires > Date.now()) return cached.body;
  const existing = pending.get(requestId);
  if (existing) return existing;
  const task = (async () => {
    await changeBudget(id, (b) => reserveBudget(b, Date.now())); // reserve before sending, including failed requests
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch {
      throw Error(
        "Prices are unavailable. Your last saved value has been kept.",
      );
    }
    const body = await response.json();
    const code = Number(body.code ?? response.status);
    if (code === 429 || code === 401 || code === 403) {
      const now = Date.now(),
        until = Date.parse(new Date(now).toISOString().slice(0, 10)) + 86400000;
      await changeBudget(id, (b) => ({ ...b!, blockedUntil: until }));
      throw Error(
        code === 429
          ? "Provider limit reached. Online prices paused until midnight UTC to protect your free allowance; saved values are unchanged."
          : "Your key or free plan cannot access this data. Online prices paused until midnight UTC; no paid upgrade is attempted.",
      );
    }
    const used = Number(response.headers.get("api-credits-used") ?? 1);
    if (Number.isFinite(used) && used > 1)
      await recordAdditionalCredits(id, Math.ceil(used) - 1);
    const left = response.headers.get("api-credits-left");
    if (left !== null && Number(left) <= 0)
      await changeBudget(id, (b) => ({
        ...b!,
        blockedUntil: Date.now() + 60_000,
      }));
    if (!response.ok || body.status === "error" || body.code)
      throw Error(
        "Price or search not available. Check the ticker and free-plan coverage.",
      );
    if (cacheable(body))
      cache.set(requestId, {
        body,
        expires:
          Date.now() +
          (url.pathname === "/quote" ? 15 * 60_000 : 24 * 60 * 60_000),
      });
    return body;
  })();
  pending.set(requestId, task);
  try {
    return await task;
  } finally {
    pending.delete(requestId);
  }
}
