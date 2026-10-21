import type { SuccessionRecord, UnitRecord } from "./gso-conversion";

const cell = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csv = (header: string[], rows: string[][]): string => `${[header, ...rows].map((row) => row.map(cell).join(",")).join("\n")}\n`;

export const unitsCsv = (units: UnitRecord[]): string =>
  csv(
    ["level", "official_code", "unit_type", "name", "full_name", "parent_official_code"],
    units.map((u) => [u.level, u.officialCode, u.unitType, u.name, u.fullName, u.parentOfficialCode]),
  );

export const successionsCsv = (successions: SuccessionRecord[]): string =>
  csv(
    ["from_official_code", "to_official_code", "kind", "is_whole", "basis", "effective_on"],
    successions.map((s) => [s.from, s.to, s.kind, String(s.isWhole), s.basis, s.effectiveOn]),
  );
