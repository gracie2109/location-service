import { normalizeText, stripLeadingTypeWord, trigramSimilarity } from "../../src/catalog/normalize";

describe("normalizeText", () => {
  it("removes diacritics, maps đ and lower-cases", () => {
    expect(normalizeText("Đặc khu Phú Quốc")).toBe("dac khu phu quoc");
  });

  it("turns punctuation into single spaces", () => {
    expect(normalizeText("  P.Bến  Nghé, ")).toBe("p ben nghe");
  });

  it("treats precomposed and decomposed input the same", () => {
    expect(normalizeText("Ví Dụ".normalize("NFD"))).toBe(normalizeText("Ví Dụ".normalize("NFC")));
  });
});

describe("stripLeadingTypeWord", () => {
  it.each([
    ["phuong alpha", "alpha"],
    ["p alpha", "alpha"],
    ["thanh pho beta", "beta"],
    ["alpha", "alpha"],
  ])("%s → %s", (input, expected) => {
    expect(stripLeadingTypeWord(input)).toBe(expected);
  });

  it("keeps the query when stripping would leave almost nothing", () => {
    expect(stripLeadingTypeWord("xa a")).toBe("xa a");
  });
});

describe("trigramSimilarity", () => {
  it("is 1 for equal text and 0 for unrelated text", () => {
    expect(trigramSimilarity("alpha", "alpha")).toBe(1);
    expect(trigramSimilarity("alpha", "zzzzz")).toBe(0);
  });

  it("is high for a one-letter typo", () => {
    expect(trigramSimilarity("alpha beta", "alpha bet")).toBeGreaterThan(0.6);
  });
});
