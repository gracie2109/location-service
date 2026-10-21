import { convertGso } from "../../src/convert/gso-conversion";
import { applyCorrections, classifyNote, FIELDS, type Correction, type Field, type RawRow } from "../../src/convert/gso-rows";
import { parseFullName, splitCoded } from "../../src/convert/gso-text";

/** Invented units; nothing here is catalog data. */
const row = (n: number, cells: Partial<Record<Field, string>>): RawRow => ({
  row: n,
  cells: { ...(Object.fromEntries(FIELDS.map((field) => [field, ""])) as Record<Field, string>), new_province: "Tỉnh Ví Dụ (90)", old_province: "Tỉnh Ví Dụ (90)", ...cells },
});
const old = (n: number, newName: string, newCode: string, oldName: string, oldCode: string, note: string, district = "Huyện Cũ (901)") =>
  row(n, { new_name: newName, new_code: newCode, old_name: oldName, old_code: oldCode, note, old_district: district });

describe("gso text", () => {
  it("splits a bracketed code and canonicalizes the type word", () => {
    expect(splitCoded("Thành phố Hà Nội (01)")).toEqual({ full: "Thành phố Hà Nội", code: "01" });
    expect(parseFullName("thị xã  Ví Dụ", "district")).toEqual({ unitType: "town", name: "Ví Dụ", fullName: "Thị xã Ví Dụ" });
    expect(parseFullName("Xa Ví Dụ", "commune")).toBeNull();
    expect(parseFullName("Huyện Ví Dụ", "commune")).toBeNull();
  });

  it("classifies every kind of note", () => {
    expect(classifyNote("Nhập toàn bộ")).toBe("whole");
    expect(classifyNote("Giữ nguyên")).toBe("whole");
    expect(classifyNote("Nhập một phần diện tích, toàn bộ dân số")).toBe("partial");
    expect(classifyNote("Nhâp một phần diện tích")).toBe("partial");
    expect(classifyNote("Đổi tên từ một phần Phường 15")).toBe("partial");
    expect(classifyNote("Phần còn lại sau khi tách một phần vào xã X")).toBe("remainder");
    expect(classifyNote("Sắp xếp toàn bộ huyện X thành đặc khu X")).toBe("district_to_special_zone");
    expect(classifyNote("Something new")).toBeNull();
  });
});

describe("corrections", () => {
  const fix = (patch: Partial<Correction> = {}): Correction => ({ row: 5, field: "old_name", expected: "Xuan A", replacement: "Xã A", reason: "typo", ...patch });

  it("replaces a cell only when it holds the expected text", () => {
    const rows = [old(5, "Xã B", "00002", "Xuan A", "00001", "Nhập toàn bộ")];
    expect(applyCorrections(rows, [fix()]).rows[0]?.cells.old_name).toBe("Xã A");
    const refused = applyCorrections(rows, [fix({ expected: "Other" })]);
    expect(refused.rows[0]?.cells.old_name).toBe("Xuan A");
    expect(refused.issues[0]).toContain('expected "Other"');
    expect(applyCorrections(rows, [fix({ row: 99 })]).issues[0]).toContain("not in the data");
  });
});

describe("convertGso", () => {
  const rows = [
    // Two old communes merged whole into a new one that keeps the code of one of them.
    old(3, "Phường Một", "00001", "Phường Cũ A", "00001", "Nhập toàn bộ"),
    old(4, "Phường Một", "00001", "Phường Cũ B", "00002", "Nhập toàn bộ"),
    // Unchanged unit.
    old(5, "Xã Hai", "00003", "Xã Hai", "00003", "Giữ nguyên"),
    // An old commune split between two new ones; neither new code was used before.
    old(6, "Xã Ba", "00004", "Xã Cũ C", "00005", "Nhập một phần"),
    old(7, "Xã Bốn", "00006", "Xã Cũ C", "00005", "Nhập một phần"),
    // A district turned into a special zone.
    row(8, { new_name: "Đặc khu Đảo", new_code: "00007", note: "Sắp xếp toàn bộ huyện Đảo thành đặc khu Đảo", old_district: "Huyện Đảo (902)" }),
  ];
  const result = convertGso(rows, []);

  it("builds both catalogs from the rows", () => {
    expect(result.report.errors).toEqual([]);
    expect(result.legacyUnits.filter((u) => u.level === "commune").map((u) => u.officialCode)).toEqual(["00001", "00002", "00003", "00005"]);
    expect(result.legacyUnits.filter((u) => u.level === "district").map((u) => u.officialCode)).toEqual(["901", "902"]);
    expect(result.currentUnits.map((u) => [u.officialCode, u.unitType])).toEqual([["90", "province"], ["00001", "ward"], ["00003", "commune"], ["00004", "commune"], ["00006", "commune"], ["00007", "special_zone"]]);
    expect(result.currentUnits.find((u) => u.officialCode === "00001")).toMatchObject({ name: "Một", fullName: "Phường Một", parentOfficialCode: "90" });
  });

  it("treats an unchanged unit as the same unit and the rest as successions, including the kept-code case", () => {
    expect(result.report.counts.identity_communes).toBe(1);
    const brief = result.successions.map((s) => `${s.from}>${s.to} ${s.kind} ${s.isWhole}`);
    expect(brief).toEqual(["00001>00001 merged_into true", "00002>00001 merged_into true", "00005>00004 part_transferred_to false", "00005>00006 part_transferred_to false", "902>00007 replaced_by true"]);
    expect(result.successions[0]?.basis).toBe("Bảng chuyển đổi ĐVHC mới - cũ, dòng 3: Nhập toàn bộ");
  });

  it("keeps the province and reports nothing left over", () => {
    expect(result.report.counts.identity_provinces).toBe(1);
    expect(result.report.new_communes_without_predecessor).toEqual([]);
    expect(result.report.legacy_units_without_successor.communes).toEqual([]);
  });

  it("leaves out an old commune code that two different communes share, and says so", () => {
    const clash = convertGso([...rows, old(9, "Xã Năm", "00008", "Xã Lạ", "00001", "Nhập toàn bộ")], []);
    expect(clash.report.conflicts).toEqual([expect.objectContaining({ level: "commune", code: "00001" })]);
    expect(clash.legacyUnits.some((u) => u.officialCode === "00001")).toBe(false);
  });

  it("reports a row it cannot read instead of guessing", () => {
    const bad = convertGso([old(3, "Xa Một", "00001", "Phường Cũ A", "00001", "Nhập toàn bộ")], []);
    expect(bad.report.errors[0]).toContain("row 3");
  });
});
