const SESSION_COOKIE = "gastos_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function getKey() {
  const secret = `${process.env.APP_PIN}::gastos-app-secret`;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionCookieValue(): Promise<string> {
  const expiry = Date.now() + SESSION_TTL_MS;
  const key = await getKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expiry)));
  return `${expiry}.${toHex(signature)}`;
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expiryStr, signature] = value.split(".");
  if (!expiryStr || !signature) return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const key = await getKey();
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiryStr));
  return toHex(expected) === signature;
}

export function verifyPin(pin: string): boolean {
  return pin === process.env.APP_PIN;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
