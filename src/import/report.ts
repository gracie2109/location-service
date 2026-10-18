import type { FileIssue, Plan } from "./types";

export type ImportMode = "dry_run" | "apply";

export type ImportReport = {
  mode: ImportMode;
  status: "succeeded" | "failed" | "already_imported";
  catalog_version_id: string | null;
  file_sha256: string;
  counts: {
    provinces_in_file: number;
    districts_in_file: number;
    communes_in_file: number;
    added: number;
    changed: number;
    unchanged: number;
    retired: number;
    retired_without_successor: number;
    successions_added: number;
    successions_skipped: number;
  };
  /** Official codes, capped so the report stays readable. */
  added_codes: string[];
  changed: { official_code: string; fields: string[] }[];
  retired_codes: string[];
  errors: string[];
};

const SAMPLE = 200;

export const emptyReport = (mode: ImportMode, fileSha256: string): ImportReport => ({
  mode,
  status: "failed",
  catalog_version_id: null,
  file_sha256: fileSha256,
  counts: {
    provinces_in_file: 0,
    districts_in_file: 0,
    communes_in_file: 0,
    added: 0,
    changed: 0,
    unchanged: 0,
    retired: 0,
    retired_without_successor: 0,
    successions_added: 0,
    successions_skipped: 0,
  },
  added_codes: [],
  changed: [],
  retired_codes: [],
  errors: [],
});

export const formatIssues = (issues: FileIssue[]): string[] =>
  issues.map((issue) => `${issue.file}${issue.line === null ? "" : ` line ${issue.line}`}: ${issue.message}`);

/** Fills the plan-derived part of the report (successions_added is set after writing). */
export const describePlan = (report: ImportReport, plan: Plan): void => {
  report.counts.added = plan.added.length;
  report.counts.changed = plan.changed.length;
  report.counts.unchanged = plan.unchanged;
  report.counts.retired = plan.retired.length;
  report.counts.retired_without_successor = plan.retiredWithoutSuccessor.length;
  report.added_codes = plan.added.slice(0, SAMPLE).map((entry) => entry.unit.officialCode);
  report.changed = plan.changed.slice(0, SAMPLE).map((entry) => ({ official_code: entry.unit.officialCode, fields: entry.fields }));
  report.retired_codes = plan.retired.slice(0, SAMPLE).map((entry) => entry.officialCode);
};
