import { it, expect } from "vitest";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { createServer } from "../apps/server/app";
it("serves the installable app and offline assets without exposing server files", async () => {
  const app = await createServer({} as Pool, { staticDir: resolve("dist") });
  try {
    const index = await app.inject({ url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain("apple-touch-icon");
    expect(index.headers["cache-control"]).toBe("no-cache");
    const manifest = await app.inject({ url: "/manifest.webmanifest" });
    expect(manifest.json().display).toBe("standalone");
    expect((await app.inject({ url: "/sw.js" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/sql-wasm.wasm" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/.env" })).statusCode).toBe(404);
    expect(
      (await app.inject({ url: "/apps/server/schema.sql" })).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
