import type { Snapshot, UnitVersion } from "./types";

const VIETNAM_TZ = "Asia/Ho_Chi_Minh";
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: VIETNAM_TZ });

/** Today's date in Vietnam as `YYYY-MM-DD`. */
export const todayInVietnam = (now: Date = new Date()): string => DAY_FORMAT.format(now);

/** The version in force on `date` (valid_from <= date < valid_to), or undefined. */
export const versionOn = (versions: UnitVersion[], date: string): UnitVersion | undefined =>
  versions.find((version) => version.validFrom <= date && (version.validTo === null || date < version.validTo));

/** A unit is active when one of its versions has no end date. */
export const isActive = (versions: UnitVersion[]): boolean => versions.some((version) => version.validTo === null);

/** The version to show for a unit: the one on `date` when given, otherwise the current one, otherwise the last. */
export const versionToShow = (versions: UnitVersion[], date?: string): UnitVersion | undefined => {
  if (date) return versionOn(versions, date);
  return versions.find((version) => version.validTo === null) ?? versions[versions.length - 1];
};

export const versionsOf = (snapshot: Snapshot, code: string): UnitVersion[] | undefined => snapshot.byCode.get(code);
