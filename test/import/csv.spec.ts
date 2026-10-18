import { parseCsv, parseCsvRecords } from "../../src/import/csv";

describe("parseCsv", () => {
  it("reads quoted fields with commas, doubled quotes and newlines", () => {
    expect(parseCsv('a,"b,1","say ""hi""","x\ny"\r\n1,2,3,4\n')).toEqual([
      ["a", "b,1", 'say "hi"', "x\ny"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("skips a BOM and blank lines, and keeps a last line without a newline", () => {
    expect(parseCsv("﻿a,b\n\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow("unterminated");
  });
});

describe("parseCsvRecords", () => {
  it("keys values by header and trims them; missing cells are empty", () => {
    const { header, records } = parseCsvRecords("x, y\n 1 ,2\n3\n");
    expect(header).toEqual(["x", "y"]);
    expect(records).toEqual([
      { line: 2, values: { x: "1", y: "2" } },
      { line: 3, values: { x: "3", y: "" } },
    ]);
  });
});
