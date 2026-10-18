import { randomInt } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** A fresh stable unit code: `vn_` + 20 random base32 characters, never derived from a name. */
export const newUnitCode = (): string => {
  let tail = "";
  for (let i = 0; i < 20; i += 1) tail += ALPHABET[randomInt(ALPHABET.length)];
  return `vn_${tail}`;
};
