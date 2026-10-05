export type Envelope = { version: 1; salt: string; iv: string; data: string };
export function b64(a: Uint8Array) {
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s);
}
export function bytes(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export const randomSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
export async function derive(passphrase: string, salt: string) {
  if (passphrase.length < 12)
    throw Error("Use a passphrase of at least 12 characters");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bytes(salt), iterations: 600000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encrypt(
  data: Uint8Array,
  key: CryptoKey,
  salt: string,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("tandem:1:" + salt),
    },
    key,
    new Uint8Array(data),
  );
  return { version: 1, salt, iv: b64(iv), data: b64(new Uint8Array(result)) };
}
export async function decrypt(e: Envelope, key: CryptoKey) {
  if (
    e.version !== 1 ||
    typeof e.salt !== "string" ||
    typeof e.data !== "string"
  )
    throw Error("Unsupported backup format");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(e.iv),
        additionalData: new TextEncoder().encode("tandem:1:" + e.salt),
      },
      key,
      bytes(e.data),
    ),
  );
}
export async function sealJSON(data: unknown, key: CryptoKey, salt: string) {
  return encrypt(new TextEncoder().encode(JSON.stringify(data)), key, salt);
}
export async function openJSON(e: Envelope, key: CryptoKey) {
  return JSON.parse(new TextDecoder().decode(await decrypt(e, key)));
}
