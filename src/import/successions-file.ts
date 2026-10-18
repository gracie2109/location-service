import type { SuccessionKind } from "../catalog/types";
import { parseCsvRecords } from "./csv";
import type { FileIssue, ParsedSuccession } from "./types";

const FILE = "successions";
const COLUMNS = ["from_official_code", "to_official_code", "kind", "is_whole", "basis", "effective_on"];
const WHOLE_BY_KIND: Record<SuccessionKind, boolean> = {
  replaced_by: true,
  merged_into: true,
  split_into: false,
  part_transferred_to: false,
};
const CODE = /^[0-9]{2,5}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the successions CSV. Each row needs a legal basis; nothing is inferred.
 * A row with the same code on both sides means the state kept the code for a unit whose territory
 * changed: the old unit is retired and the unit in the units file gets a new `code`.
 */
export const parseSuccessionsFile = (text: string): { successions: ParsedSuccession[]; issues: FileIssue[] } => {
  const issues: FileIssue[] = [];
  const problem = (line: number | null, message: string) => issues.push({ file: FILE, line, message });

  let parsed: ReturnType<typeof parseCsvRecords>;
  try {
    parsed = parseCsvRecords(text);
  } catch (error) {
    problem(null, error instanceof Error ? error.message : "unreadable file");
    return { successions: [], issues };
  }
  if (parsed.header.join(",") !== COLUMNS.join(",")) {
    problem(1, `columns must be exactly: ${COLUMNS.join(",")}`);
    return { successions: [], issues };
  }

  const successions: ParsedSuccession[] = [];
  const seen = new Set<string>();
  for (const { line, values } of parsed.records) {
    const before = issues.length;
    const from = values.from_official_code ?? "";
    const to = values.to_official_code ?? "";
    const kind = values.kind as SuccessionKind;
    if (!CODE.test(from)) problem(line, `from_official_code "${from}" is not a code`);
    if (!CODE.test(to)) problem(line, `to_official_code "${to}" is not a code`);
    if (!(kind in WHOLE_BY_KIND)) problem(line, `kind "${values.kind}" is not valid`);
    if (values.is_whole !== "true" && values.is_whole !== "false") problem(line, "is_whole must be true or false");
    else if (kind in WHOLE_BY_KIND && (values.is_whole === "true") !== WHOLE_BY_KIND[kind]) {
      problem(line, `${kind} must have is_whole ${WHOLE_BY_KIND[kind]}`);
    }
    if (!values.basis) problem(line, "basis (legal reference) is required");
    if (!DATE.test(values.effective_on ?? "")) problem(line, "effective_on must be YYYY-MM-DD");

    const key = `${from}>${to}:${kind}`;
    if (seen.has(key)) problem(line, `duplicate succession ${key}`);
    seen.add(key);

    if (issues.length > before) continue;
    successions.push({
      line,
      fromOfficialCode: from,
      toOfficialCode: to,
      kind,
      isWhole: values.is_whole === "true",
      basis: values.basis ?? "",
      effectiveOn: values.effective_on ?? "",
    });
  }
  return { successions, issues };
};
