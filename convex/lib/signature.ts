// HMAC-SHA256 signatures for the Convex <-> n8n integration, used in both
// directions. The sender signs `${timestamp}.${payload}` and sends:
//
//   X-LendLoop-Timestamp: unix seconds
//   X-LendLoop-Signature: sha256=<hex digest>
//
// `payload` is the raw request body for POST, and the path with its query
// string for GET. The timestamp limits how long a captured request stays valid.

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const MAX_SKEW_SECONDS = 5 * 60;

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length !== 64 || /[^0-9a-f]/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function sign(
  secret: string,
  timestamp: string,
  payload: string,
): Promise<string> {
  const key = await importKey(secret);
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  return `sha256=${toHex(digest)}`;
}

export async function signedHeaders(
  secret: string,
  payload: string,
  now: number = Date.now(),
): Promise<Record<string, string>> {
  const timestamp = Math.floor(now / 1000).toString();
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: await sign(secret, timestamp, payload),
  };
}

export async function verify(
  secret: string,
  headers: Headers,
  payload: string,
  now: number = Date.now(),
): Promise<boolean> {
  const timestamp = headers.get(TIMESTAMP_HEADER);
  const signature = headers.get(SIGNATURE_HEADER);
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;

  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (age > MAX_SKEW_SECONDS) return false;

  const digest = fromHex(signature.replace(/^sha256=/, ""));
  if (digest === null) return false;

  // subtle.verify compares in constant time.
  const key = await importKey(secret);
  return await crypto.subtle.verify(
    "HMAC",
    key,
    digest,
    encoder.encode(`${timestamp}.${payload}`),
  );
}
