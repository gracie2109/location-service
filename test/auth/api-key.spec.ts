import { generateApiKey, hashSecret, isScope, parseApiKey, secretMatches } from "../../src/auth/api-key";

describe("api keys", () => {
  it("generates a key that parses back to its prefix and a matching hash", () => {
    const { key, prefix, hash } = generateApiKey();
    const parsed = parseApiKey(key);
    expect(parsed?.prefix).toBe(prefix);
    expect(parsed && secretMatches(parsed.secret, hash)).toBe(true);
  });

  it("does not store the secret in the hash input form", () => {
    const { key, hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(hash);
  });

  it("generates different keys each time", () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });

  it.each(["", "lsk_abc", "Bearer lsk_aaaaaaaa_x", "lsk_AAAAAAAA_0123456789abcdefghjkmnpqrstvwxyz", "lsk_aaaaaaaa_0123456789abcdefghjkmnpqrstvwxyi"])(
    "rejects %j",
    (text) => {
      expect(parseApiKey(text)).toBeNull();
    },
  );

  it("fails a wrong secret", () => {
    expect(secretMatches("0123456789abcdefghjkmnpqrstvwxyz", hashSecret("zyxwvtsrqpnmkjhgfedcba9876543210"))).toBe(false);
  });

  it("knows the scopes", () => {
    expect(isScope("catalog:snapshot")).toBe(true);
    expect(isScope("admin")).toBe(false);
  });
});
