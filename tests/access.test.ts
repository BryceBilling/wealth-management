import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAccessVerifier } from "../apps/server/access";

const issuer = "https://tandem.cloudflareaccess.com";
const audience = "test-app-audience";
const allowedEmails = ["owner@example.com"];
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  use: "sig",
  alg: "RS256",
};

function token(claimOverrides: Record<string, unknown> = {}) {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: [audience],
      exp: Math.floor(Date.now() / 1000) + 60,
      email: "owner@example.com",
      ...claimOverrides,
    }),
  ).toString("base64url");
  const payload = `${header}.${claims}`;
  return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`;
}

describe("Cloudflare Access origin verification", () => {
  const verifier = createAccessVerifier(
    { teamDomain: "tandem.cloudflareaccess.com", audience, allowedEmails },
    async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }),
  );

  it("accepts a valid token signed by the configured team", async () => {
    expect(await verifier(token())).toBe(true);
  });

  it("rejects missing, expired, wrong-audience, and altered tokens", async () => {
    expect(await verifier(undefined)).toBe(false);
    expect(await verifier(token({ exp: 1 }))).toBe(false);
    expect(await verifier(token({ aud: ["other-app"] }))).toBe(false);
    expect(await verifier(token({ email: "outsider@example.com" }))).toBe(
      false,
    );
    const [header, claims, signature] = token().split(".");
    const damaged = Buffer.from(signature, "base64url");
    damaged[0] ^= 1;
    const altered = `${header}.${claims}.${damaged.toString("base64url")}`;
    expect(await verifier(altered)).toBe(false);
  });
});
