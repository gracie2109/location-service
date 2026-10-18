import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const SCOPES = ["catalog:snapshot", "provider-codes:read"] as const;
export type Scope = (typeof SCOPES)[number];

const PREFIX_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const SECRET_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const KEY_PATTERN = /^lsk_([a-z0-9]{8})_([0-9a-hjkmnp-tv-z]{32})$/;

const randomString = (alphabet: string, length: number): string => {
  let result = "";
  for (let i = 0; i < length; i += 1) result += alphabet[randomInt(alphabet.length)];
  return result;
};

export const hashSecret = (secret: string): string => createHash("sha256").update(secret).digest("hex");

/** A new key. `key` is shown once; only `prefix` and `hash` are stored. */
export const generateApiKey = (): { key: string; prefix: string; hash: string } => {
  const prefix = randomString(PREFIX_ALPHABET, 8);
  const secret = randomString(SECRET_ALPHABET, 32);
  return { key: `lsk_${prefix}_${secret}`, prefix, hash: hashSecret(secret) };
};

/** Splits `lsk_<prefix>_<secret>`; null when the text is not shaped like a key. */
export const parseApiKey = (text: string): { prefix: string; secret: string } | null => {
  const match = KEY_PATTERN.exec(text);
  return match?.[1] && match[2] ? { prefix: match[1], secret: match[2] } : null;
};

export const secretMatches = (secret: string, storedHash: string): boolean => {
  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const isScope = (value: string): value is Scope => (SCOPES as readonly string[]).includes(value);
