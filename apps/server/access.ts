import { createPublicKey, verify } from "node:crypto";

type AccessConfig = {
  teamDomain: string;
  audience: string;
  allowedEmails: string[];
};
type Jwk = {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  [key: string]: unknown;
};
type JwtHeader = { alg?: string; kid?: string };
type JwtClaims = {
  iss?: string;
  aud?: string | string[];
  email?: string;
  exp?: number;
  nbf?: number;
};

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString());

export function createAccessVerifier(
  config: AccessConfig,
  fetcher: typeof fetch = fetch,
) {
  const issuer = `https://${config.teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const allowedEmails = new Set(
    config.allowedEmails.map((email) => email.trim().toLowerCase()),
  );
  let keys: Jwk[] = [];
  let keysExpireAt = 0;

  async function getKeys(force = false): Promise<Jwk[]> {
    if (!force && keys.length && Date.now() < keysExpireAt) return keys;
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Unable to load Access signing keys");
    const data = (await response.json()) as { keys?: Jwk[] };
    if (!Array.isArray(data.keys) || !data.keys.length)
      throw new Error("Access signing keys are missing");
    keys = data.keys;
    keysExpireAt = Date.now() + 10 * 60 * 1000;
    return keys;
  }

  return async (token: string | undefined): Promise<boolean> => {
    if (!token || token.length > 16000) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    let header: JwtHeader;
    let claims: JwtClaims;
    try {
      header = decode(parts[0]);
      claims = decode(parts[1]);
    } catch {
      return false;
    }
    if (header.alg !== "RS256" || !header.kid) return false;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== issuer ||
      !aud.includes(config.audience) ||
      typeof claims.email !== "string" ||
      !allowedEmails.has(claims.email.toLowerCase()) ||
      typeof claims.exp !== "number" ||
      claims.exp <= now ||
      (typeof claims.nbf === "number" && claims.nbf > now + 60)
    )
      return false;

    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const jwk = (await getKeys(attempt > 0)).find(
          (key) => key.kid === header.kid && key.kty === "RSA",
        );
        if (!jwk) continue;
        const key = createPublicKey({ key: jwk as any, format: "jwk" });
        if (
          verify(
            "RSA-SHA256",
            Buffer.from(`${parts[0]}.${parts[1]}`),
            key,
            Buffer.from(parts[2], "base64url"),
          )
        )
          return true;
      }
    } catch {
      return false;
    }
    return false;
  };
}
