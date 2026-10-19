import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { parseMemoryMiB, findPrimaryVolume, buildWindowsPasswordChangeCommand } from "../../src/services/proxmox.service";
import { logger } from "../../src/utils/logger";

describe("parseMemoryMiB", () => {
  let errorSpy: any;

  beforeEach(() => {
    errorSpy = spyOn(logger, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  // ── GB parsing ────────────────────────────────────────────────────────────
  it("PU-1: parses integer GB", () => {
    expect(parseMemoryMiB("2GB")).toBe(2048);
  });

  it("PU-2: parses GB with space before unit", () => {
    expect(parseMemoryMiB("2 GB")).toBe(2048);
  });

  it("PU-3: parses GB case-insensitive (lowercase)", () => {
    expect(parseMemoryMiB("4gb")).toBe(4096);
  });

  it("PU-4: parses decimal 1.5GB → 1536 MiB", () => {
    expect(parseMemoryMiB("1.5GB")).toBe(1536);
  });

  it("PU-5: parses decimal 2.5GB → 2560 MiB", () => {
    expect(parseMemoryMiB("2.5GB")).toBe(2560);
  });

  it("PU-6: parses large GB (16GB)", () => {
    expect(parseMemoryMiB("16GB")).toBe(16384);
  });

  // ── MB parsing ────────────────────────────────────────────────────────────
  it("PU-7: parses integer MB", () => {
    expect(parseMemoryMiB("512MB")).toBe(512);
  });

  it("PU-8: parses MB with space before unit", () => {
    expect(parseMemoryMiB("1024 MB")).toBe(1024);
  });

  it("PU-9: parses MB case-insensitive (lowercase)", () => {
    expect(parseMemoryMiB("256mb")).toBe(256);
  });

  // ── Default fallback (1024) ───────────────────────────────────────────────
  it("PU-10: returns 1024 for empty string and logs error", () => {
    expect(parseMemoryMiB("")).toBe(1024);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("PU-11: returns 1024 for unsupported unit TB and logs error", () => {
    expect(parseMemoryMiB("2TB")).toBe(1024);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("PU-12: returns 1024 for plain string and logs error", () => {
    expect(parseMemoryMiB("invalid")).toBe(1024);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("PU-13: returns 1024 for number-only string and logs error", () => {
    expect(parseMemoryMiB("1024")).toBe(1024);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe("findPrimaryVolume", () => {
  it("PV-1: finds Linux root filesystem at mountpoint '/'", () => {
    const entries = [
      { mountpoint: "/boot", "total-bytes": 1_000_000, "used-bytes": 100_000 },
      { mountpoint: "/", "total-bytes": 50_000_000_000, "used-bytes": 20_000_000_000 },
    ];
    expect(findPrimaryVolume(entries)).toBe(entries[1]);
  });

  it("PV-2: finds Windows C: drive when no Linux root exists", () => {
    const entries = [
      { mountpoint: "D:\\", type: "CDFS", "total-bytes": 389_120, "used-bytes": 389_120 },
      { mountpoint: "System Reserved", type: "FAT32", "total-bytes": 100_000_000 },
      { mountpoint: "C:\\", type: "NTFS", "total-bytes": 31_538_016_256, "used-bytes": 18_870_493_184 },
    ];
    expect(findPrimaryVolume(entries)).toBe(entries[2]);
  });

  it("PV-3: falls back to the largest drive-lettered volume when there's no C: drive", () => {
    const entries = [
      { mountpoint: "D:\\", type: "NTFS", "total-bytes": 10_000_000_000 },
      { mountpoint: "E:\\", type: "NTFS", "total-bytes": 40_000_000_000 },
    ];
    expect(findPrimaryVolume(entries)).toBe(entries[1]);
  });

  it("PV-4: returns null when no root or drive-lettered volume exists", () => {
    const entries = [
      { mountpoint: "System Reserved", type: "FAT32", "total-bytes": 100_000_000 },
    ];
    expect(findPrimaryVolume(entries)).toBeNull();
  });

  it("PV-5: returns null for empty entries", () => {
    expect(findPrimaryVolume([])).toBeNull();
  });
});

describe("buildWindowsPasswordChangeCommand", () => {
  const decode = (encoded: string) => Buffer.from(encoded, "base64").toString("utf16le");

  it("WPC-1: builds a powershell.exe -EncodedCommand invocation", () => {
    const cmd = buildWindowsPasswordChangeCommand("Administrator", "NewSecurePass1");
    expect(cmd[0]).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(cmd).toContain("-EncodedCommand");
  });

  it("WPC-2: encoded script embeds username and password as single-quoted literals", () => {
    const cmd = buildWindowsPasswordChangeCommand("Administrator", "NewSecurePass1");
    const encoded = cmd[cmd.length - 1];
    const script = decode(encoded);
    expect(script).toContain("Set-LocalUser -Name 'Administrator' -Password $s");
    expect(script).toContain("ConvertTo-SecureString 'NewSecurePass1'");
  });

  it("WPC-3: doubles a literal single-quote in username/password (defensive escape)", () => {
    const cmd = buildWindowsPasswordChangeCommand("O'Brien", "pass'word");
    const script = decode(cmd[cmd.length - 1]);
    expect(script).toContain("'O''Brien'");
    expect(script).toContain("'pass''word'");
  });

  it("WPC-4: script sets $ErrorActionPreference and exits non-zero on failure", () => {
    const cmd = buildWindowsPasswordChangeCommand("Administrator", "NewSecurePass1");
    const script = decode(cmd[cmd.length - 1]);
    expect(script).toContain("$ErrorActionPreference = 'Stop'");
    expect(script).toContain("exit 1");
  });
});
