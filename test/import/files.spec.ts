import { parseSuccessionsFile } from "../../src/import/successions-file";
import { parseUnitsFile } from "../../src/import/units-file";

const HEADER = "level,official_code,unit_type,name,full_name,parent_official_code";

describe("parseUnitsFile", () => {
  it("reads valid rows", () => {
    const { units, issues } = parseUnitsFile(`${HEADER}\nprovince,90,province,Ví Dụ,Tỉnh Ví Dụ,\ncommune,90001,ward,Alpha,Phường Alpha,90\n`);
    expect(issues).toEqual([]);
    expect(units.map((u) => [u.level, u.officialCode, u.parentOfficialCode])).toEqual([["province", "90", null], ["commune", "90001", "90"]]);
  });

  it("keeps leading zeros of official codes", () => {
    const { units } = parseUnitsFile(`${HEADER}\nprovince,01,province,Một,Tỉnh Một,\n`);
    expect(units[0]?.officialCode).toBe("01");
  });

  it("reports every problem with its line", () => {
    const text = [
      HEADER,
      "province,9,province,A,Tỉnh A,",
      "commune,90001,province,B,Xã B,90",
      "commune,90002,ward,,Phường C,",
      "province,90,province,D,Tỉnh D,",
      "province,90,province,D,Tỉnh D,",
      "district,901,rural_district,E,Huyện E,90",
    ].join("\n");
    const messages = parseUnitsFile(text).issues.map((i) => `${i.line}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('2: official_code "9" is not 2 digits'),
        expect.stringContaining('3: unit_type "province" is not valid for level commune'),
        expect.stringContaining("4: name is empty"),
        expect.stringContaining("4: a commune needs parent_official_code"),
        expect.stringContaining("6: official_code 90 is repeated (first at line 5)"),
        expect.stringContaining('7: level must be province or commune, got "district"'),
      ]),
    );
  });

  it("requires the needed columns and rejects unknown ones", () => {
    expect(parseUnitsFile("level,official_code\n").issues.map((i) => i.message)).toContain("missing column unit_type");
    expect(parseUnitsFile(`${HEADER},colour\n`).issues.map((i) => i.message)).toContain("unknown column colour");
  });

  it("checks the optional English names and centroid together", () => {
    const text = `${HEADER},name_en,en_names_source,centroid_lat,centroid_lon,centroid_source\nprovince,90,province,A,Tỉnh A,,A,,10.5,,\n`;
    const messages = parseUnitsFile(text).issues.map((i) => i.message);
    expect(messages).toEqual(expect.arrayContaining(["English names need en_names_source", "centroid_lat and centroid_lon go together"]));
  });
});

const SUCCESSION_HEADER = "from_official_code,to_official_code,kind,is_whole,basis,effective_on";

describe("parseSuccessionsFile", () => {
  it("reads valid rows", () => {
    const { successions, issues } = parseSuccessionsFile(`${SUCCESSION_HEADER}\n90100,90002,merged_into,true,Fixture resolution,2025-07-01\n`);
    expect(issues).toEqual([]);
    expect(successions[0]).toMatchObject({ fromOfficialCode: "90100", toOfficialCode: "90002", kind: "merged_into", isWhole: true });
  });

  it("requires a basis, a consistent is_whole and a date", () => {
    const text = `${SUCCESSION_HEADER}\n1000,2000,merged_into,false,,2025-07-01\n1000,2001,split_into,true,Basis,x\n`;
    const messages = parseSuccessionsFile(text).issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining(["merged_into must have is_whole true", "basis (legal reference) is required", "split_into must have is_whole false", "effective_on must be YYYY-MM-DD"]),
    );
  });

  it("rejects different columns", () => {
    expect(parseSuccessionsFile("a,b\n").issues[0]?.message).toContain("columns must be exactly");
  });
});
