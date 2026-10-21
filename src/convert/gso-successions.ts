import type { SourceRow } from "./gso-rows";
import type { Collected } from "./gso-units";

export type SuccessionKind = "replaced_by" | "merged_into" | "split_into" | "part_transferred_to";
export type SuccessionLink = { from: string; to: string; kind: SuccessionKind; isWhole: boolean; basis: string };

export type Links = {
  successions: SuccessionLink[];
  /** New units that are the same unit as the old one with the same code (same territory): a new version, no succession. */
  identityCommunes: Set<string>;
  identityProvinces: Set<string>;
  warnings: string[];
};

const SOURCE = "Bảng chuyển đổi ĐVHC mới - cũ";

const group = <K, V>(items: V[], key: (item: V) => K): Map<K, V[]> => {
  const groups = new Map<K, V[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
};

const sameCodeIsolated = (predecessors: Set<string>, code: string): boolean => predecessors.size === 1 && predecessors.has(code);

const communeLinks = (rows: SourceRow[], oldUnits: Collected, excluded: Set<string>, links: Links): void => {
  const linked = rows.filter((row) => row.oldCommune && !excluded.has(row.oldCommune.code) && oldUnits.communes.has(row.oldCommune.code));
  const byNew = group(linked, (row) => row.newCommune.code);

  for (const [code, list] of byNew) {
    const predecessors = new Set(list.map((row) => row.oldCommune!.code));
    if (sameCodeIsolated(predecessors, code) && list.every((row) => row.kind === "whole" || row.kind === "remainder")) {
      links.identityCommunes.add(code);
      continue;
    }
    for (const [pairKey, pair] of group(list, (row) => row.oldCommune!.code)) {
      const first = pair[0]!;
      const isWhole = pair.some((row) => row.kind === "whole");
      if (isWhole && pair.some((row) => row.kind === "partial")) links.warnings.push(`row ${first.row}: ${pairKey} -> ${code} has both whole and partial rows`);
      const kind: SuccessionKind = !isWhole ? "part_transferred_to" : predecessors.size > 1 ? "merged_into" : "replaced_by";
      links.successions.push({ from: pairKey, to: code, kind, isWhole, basis: `${SOURCE}, dòng ${first.row}: ${first.note}` });
    }
    if (!predecessors.has(code) && oldUnits.communes.has(code)) {
      links.warnings.push(`new commune ${code} reuses the code of old commune ${code}, which is not among its predecessors (rows ${list.map((r) => r.row).join(",")})`);
    }
  }

  // An old district that became a special zone has no old communes in the table.
  for (const row of rows.filter((r) => r.kind === "district_to_special_zone")) {
    if (!row.oldDistrict || !oldUnits.districts.has(row.oldDistrict.code)) {
      links.warnings.push(`row ${row.row}: old district of a special zone is not a known district`);
      continue;
    }
    links.successions.push({ from: row.oldDistrict.code, to: row.newCommune.code, kind: "replaced_by", isWhole: true, basis: `${SOURCE}, dòng ${row.row}: ${row.note}` });
  }

  const wholeAndPart = group(linked, (row) => row.oldCommune!.code);
  for (const [oldCode, list] of wholeAndPart) {
    const targets = new Set(list.filter((r) => r.kind === "whole").map((r) => r.newCommune.code));
    if (targets.size > 1) links.warnings.push(`old commune ${oldCode} is wholly merged into ${targets.size} units (rows ${list.map((r) => r.row).join(",")})`);
  }
};

const provinceLinks = (rows: SourceRow[], oldUnits: Collected, links: Links): void => {
  const withProvince = rows.filter((row) => row.oldProvince && oldUnits.provinces.has(row.oldProvince.code));
  const pairs = group(withProvince, (row) => `${row.oldProvince!.code}>${row.newProvince.code}`);
  const targets = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  for (const row of withProvince) {
    const from = row.oldProvince!.code;
    targets.set(from, (targets.get(from) ?? new Set()).add(row.newProvince.code));
    predecessors.set(row.newProvince.code, (predecessors.get(row.newProvince.code) ?? new Set()).add(from));
  }

  for (const [newCode, from] of predecessors) {
    if (sameCodeIsolated(from, newCode) && targets.get(newCode)?.size === 1) links.identityProvinces.add(newCode);
  }
  for (const [pairKey, pair] of pairs) {
    const [oldCode = "", newCode = ""] = pairKey.split(">");
    if (links.identityProvinces.has(newCode) && oldCode === newCode) continue;
    const splits = (targets.get(oldCode)?.size ?? 0) > 1;
    const kind: SuccessionKind = splits ? "split_into" : (predecessors.get(newCode)?.size ?? 0) > 1 ? "merged_into" : "replaced_by";
    links.successions.push({
      from: oldCode,
      to: newCode,
      kind,
      isWhole: !splits,
      basis: `${SOURCE}: suy ra từ ${pair.length} dòng xã (ví dụ dòng ${pair[0]!.row})`,
    });
  }
};

export const buildLinks = (rows: SourceRow[], oldUnits: Collected): Links => {
  const links: Links = { successions: [], identityCommunes: new Set(), identityProvinces: new Set(), warnings: [] };
  const excluded = new Set(oldUnits.conflicts.filter((c) => c.level === "commune").map((c) => c.code));
  communeLinks(rows, oldUnits, excluded, links);
  provinceLinks(rows, oldUnits, links);
  return links;
};
