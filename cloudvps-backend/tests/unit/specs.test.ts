import { describe, it, expect } from "bun:test";
import { parseGib, parseDiskGb } from "../../src/utils/specs";

describe("parseGib", () => {
  it("parses explicit GB unit", () => {
    expect(parseGib("4GB")).toBe(4);
    expect(parseGib("16 GB")).toBe(16);
  });

  it("parses explicit MB unit and converts to GiB", () => {
    expect(parseGib("4096MB")).toBe(4);
    expect(parseGib("2048 MB")).toBe(2);
  });

  it("treats a bare number with no unit as GB", () => {
    expect(parseGib("4")).toBe(4);
    expect(parseGib("16")).toBe(16);
  });

  it("falls back to 1 when unparseable", () => {
    expect(parseGib("")).toBe(1);
    expect(parseGib("abc")).toBe(1);
  });
});

describe("parseDiskGb", () => {
  it("parses explicit GB and TB units", () => {
    expect(parseDiskGb("80GB")).toBe(80);
    expect(parseDiskGb("2TB")).toBe(2048);
  });

  it("falls back to 20 when unparseable", () => {
    expect(parseDiskGb("")).toBe(20);
    expect(parseDiskGb("abc")).toBe(20);
  });
});
