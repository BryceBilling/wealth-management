import { Vault } from "../database/vault";
import { sealJSON, openJSON, type Envelope } from "../database/crypto";
import { validateEvent } from "../types";
export type SyncConfig = { url: string; token: string; device: string };
export type WireEvent = { id: string; envelope: Envelope };
export async function request(
  url: string,
  path: string,
  body?: unknown,
  token?: string,
) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  )
    throw Error("Sync requires HTTPS outside localhost");
  const res = await fetch(url.replace(/\/$/, "") + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? "Synchronization failed");
  return data;
}
export async function sync(vault: Vault, config: SyncConfig) {
  const wire = await vault.mutate(async (repo) => {
    const pending = repo.pending();
    const wire: WireEvent[] = [];
    for (const e of pending) {
      const envelope =
        repo.envelope(e.id) ?? (await sealJSON(e, vault.key, vault.salt));
      repo.setEnvelope(e.id, envelope);
      wire.push({ id: e.id, envelope });
    }
    return wire;
  });
  return vault.mutate(async (repo) => {
    for (let i = 0; i < wire.length; i += 100)
      await request(
        config.url,
        "/sync/push",
        { events: wire.slice(i, i + 100) },
        config.token,
      );
    let cursor = repo.cursor;
    for (;;) {
      const result = await request(
        config.url,
        "/sync/pull?cursor=" + cursor,
        undefined,
        config.token,
      );
      for (const item of result.events) {
        if (item.envelope.salt !== vault.salt)
          throw Error(
            "Household encryption key differs. Pair with the original backup",
          );
        const event = validateEvent(await openJSON(item.envelope, vault.key));
        if (event.id !== item.id) throw Error("Invalid event envelope");
        const hh = repo.rows("household")[0];
        if (hh && !hh.users.some((u) => u.id === event.actor))
          throw Error("Unknown event author");
        repo.append(event);
        repo.setEnvelope(event.id, item.envelope);
      }
      cursor = result.cursor;
      if (!result.more) break;
    }
    repo.cursor = cursor;
    repo.acknowledge(wire.map((e) => e.id));
  });
}
