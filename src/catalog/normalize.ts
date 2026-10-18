/** Lower-case, accent-free, punctuation-free form used for matching Vietnamese names. */
export const normalizeText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const LEADING_TYPE_WORDS = /^(?:(?:thanh pho|tinh|phuong|dac khu|thi xa|thi tran|quan|huyen|xa|tp|p|x|q|h|t)\s+)+/;

/** The query without a leading unit-type word ("p ben thanh" → "ben thanh"); same text if nothing is left. */
export const stripLeadingTypeWord = (normalized: string): string => {
  const stripped = normalized.replace(LEADING_TYPE_WORDS, "");
  return stripped.length >= 2 ? stripped : normalized;
};

const trigrams = (text: string): Set<string> => {
  const padded = `  ${text} `;
  const result = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) result.add(padded.slice(i, i + 3));
  return result;
};

/** Share of trigrams two normalized strings have in common (0 to 1), like pg_trgm. */
export const trigramSimilarity = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const left = trigrams(a);
  const right = trigrams(b);
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
};
