import { b64, bytes, decrypt, derive } from "./crypto";
import { Vault } from "./vault";
import type { Storage } from "./storage";
const RECORD = "tandem-biometric-v1";
type Registration = {
  version: 1;
  credential: string;
  input: string;
  iv: string;
  sealed: string;
  salt: string;
};
type PrfResult = {
  prf?: { enabled?: boolean; results?: { first: ArrayBuffer } };
};
export function biometricEnabled() {
  try {
    return !!readRegistration();
  } catch {
    return false;
  }
}
function readRegistration(): Registration | null {
  const raw = localStorage.getItem(RECORD);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (
    value.version !== 1 ||
    ![value.credential, value.input, value.iv, value.sealed, value.salt].every(
      (x) => typeof x === "string" && x.length > 0 && x.length < 16000,
    )
  )
    throw Error(
      "Biometric setup is invalid. Unlock with your passphrase and enable it again.",
    );
  return value;
}
export async function biometricAvailable() {
  return !!(
    window.isSecureContext &&
    window.PublicKeyCredential &&
    (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(
      () => false,
    ))
  );
}
export function removeBiometric() {
  localStorage.removeItem(RECORD);
}
async function wrappingKey(credential: string, input: string) {
  const result = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ id: bytes(credential), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
      extensions: {
        prf: { eval: { first: bytes(input) } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!result || b64(new Uint8Array(result.rawId)) !== credential)
    throw Error(
      "Device verification cancelled. Use your vault passphrase instead.",
    );
  const response = result.response as AuthenticatorAssertionResponse;
  if (!(new Uint8Array(response.authenticatorData)[32] & 4))
    throw Error("Device verification is required.");
  const output = (result.getClientExtensionResults() as PrfResult).prf?.results
    ?.first;
  if (!output || output.byteLength !== 32)
    throw Error(
      "This device’s passkey provider does not support encrypted biometric unlock (PRF). Continue using your vault passphrase.",
    );
  return crypto.subtle.importKey("raw", output, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
const aad = (salt: string, credential: string) =>
  new TextEncoder().encode(
    "tandem-biometric-v1:" + location.origin + ":" + salt + ":" + credential,
  );
export async function enableBiometric(vault: Vault, passphrase: string) {
  if (!(await biometricAvailable()))
    throw Error(
      "Biometric unlock is unavailable in this browser. Use a supported HTTPS browser with a device screen lock.",
    );
  // Confirm the supplied passphrase actually opens this vault before enrollment.
  await decrypt(await vault.backup(), await derive(passphrase, vault.salt));
  const input = b64(crypto.getRandomValues(new Uint8Array(32)));
  const result = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: location.hostname, name: "Tandem" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(32)),
        name: "Tandem vault",
        displayName: "Tandem vault unlock",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      attestation: "none",
      timeout: 60000,
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!result) throw Error("Passkey setup cancelled.");
  if (!(result.getClientExtensionResults() as PrfResult).prf?.enabled)
    throw Error(
      "Your passkey provider does not support encrypted biometric unlock (PRF). Your passphrase still works.",
    );
  const credential = b64(new Uint8Array(result.rawId));
  const key = await wrappingKey(credential, input);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(vault.salt, credential) },
    key,
    new TextEncoder().encode(passphrase),
  );
  const record: Registration = {
    version: 1,
    credential,
    input,
    iv: b64(iv),
    sealed: b64(new Uint8Array(sealed)),
    salt: vault.salt,
  };
  localStorage.setItem(RECORD, JSON.stringify(record));
}
export async function unlockBiometric(storage: Storage) {
  const record = readRegistration();
  if (!record) throw Error("Enable biometric unlock in Settings first.");
  const envelope = await storage.read();
  if (!envelope || envelope.salt !== record.salt)
    throw Error(
      "This vault has changed. Unlock with your passphrase and enable biometrics again.",
    );
  const key = await wrappingKey(record.credential, record.input);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes(record.iv),
      additionalData: aad(record.salt, record.credential),
    },
    key,
    bytes(record.sealed),
  );
  const decoded = new Uint8Array(plain);
  try {
    return await Vault.unlock(new TextDecoder().decode(decoded), storage);
  } finally {
    decoded.fill(0);
  }
}
