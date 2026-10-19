import { describe, it, expect, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  validateFile,
  saveUploadedFile,
  deleteFile,
  fileToBase64,
} from "../../src/utils/file.utils";

const TEST_UPLOAD_DIR = "uploads/__test__";

afterAll(async () => {
  await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
});

// Helper: create an in-memory File from bytes
function makeFile(name: string, type: string, sizeBytes: number): File {
  const bytes = new Uint8Array(sizeBytes).fill(1);
  return new File([bytes], name, { type });
}

// Minimal 1×1 PNG (valid image bytes)
const PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
  0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 15, 0, 0, 1, 1, 0, 5, 24, 213, 78,
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const validConfig = { maxSizeMB: 5, allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] };

// ── validateFile ──────────────────────────────────────────────────────────────

describe("validateFile", () => {
  it("returns null for valid file", () => {
    const file = makeFile("a.png", "image/png", 1024);
    expect(validateFile(file, validConfig)).toBeNull();
  });

  it("returns FILE_TOO_LARGE when exceeds maxSizeMB", () => {
    const file = makeFile("big.jpg", "image/jpeg", 6 * 1024 * 1024);
    expect(validateFile(file, validConfig)).toBe("FILE_TOO_LARGE");
  });

  it("returns INVALID_FILE_TYPE for disallowed mime", () => {
    const file = makeFile("doc.pdf", "application/pdf", 100);
    expect(validateFile(file, validConfig)).toBe("INVALID_FILE_TYPE");
  });

  it("returns INVALID_FILE_TYPE for text/plain", () => {
    const file = makeFile("note.txt", "text/plain", 100);
    expect(validateFile(file, validConfig)).toBe("INVALID_FILE_TYPE");
  });

  it("accepts all allowed image types", () => {
    for (const type of validConfig.allowedTypes) {
      const file = makeFile("img", type, 1024);
      expect(validateFile(file, validConfig)).toBeNull();
    }
  });

  it("rejects file at exactly maxSizeMB+1 byte", () => {
    const file = makeFile("big.png", "image/png", 5 * 1024 * 1024 + 1);
    expect(validateFile(file, validConfig)).toBe("FILE_TOO_LARGE");
  });

  it("accepts file at exactly maxSizeMB", () => {
    const file = makeFile("ok.png", "image/png", 5 * 1024 * 1024);
    expect(validateFile(file, validConfig)).toBeNull();
  });
});

// ── saveUploadedFile ──────────────────────────────────────────────────────────

describe("saveUploadedFile", () => {
  it("saves file and returns url, filePath, size, mimeType", async () => {
    const file = new File([PNG_BYTES], "test.png", { type: "image/png" });
    const result = await saveUploadedFile(file, TEST_UPLOAD_DIR);

    expect(result.url).toMatch(/^\/uploads\/__test__\/\d{4}-\d{2}\/[0-9a-f-]+\.png$/);
    // Normalise separators for cross-platform comparison
    expect(result.filePath.replace(/\\/g, "/")).toContain(TEST_UPLOAD_DIR);
    expect(result.size).toBe(PNG_BYTES.length);
    expect(result.mimeType).toBe("image/png");

    // File must actually exist on disk
    const saved = Bun.file(result.filePath);
    expect(await saved.exists()).toBe(true);
  });

  it("generates unique filenames for same file uploaded twice", async () => {
    const file = new File([PNG_BYTES], "dup.png", { type: "image/png" });
    const [r1, r2] = await Promise.all([
      saveUploadedFile(file, TEST_UPLOAD_DIR),
      saveUploadedFile(file, TEST_UPLOAD_DIR),
    ]);
    expect(r1.filePath).not.toBe(r2.filePath);
  });

  it("strips non-alphanumeric chars from extension", async () => {
    const file = new File([PNG_BYTES], "evil../../../etc.png", { type: "image/png" });
    const result = await saveUploadedFile(file, TEST_UPLOAD_DIR);
    expect(result.url).toMatch(/\.png$/);
    expect(result.url).not.toContain("..");
  });
});

// ── deleteFile ────────────────────────────────────────────────────────────────

describe("deleteFile", () => {
  it("deletes an existing file", async () => {
    const file = new File([PNG_BYTES], "todel.png", { type: "image/png" });
    const { filePath } = await saveUploadedFile(file, TEST_UPLOAD_DIR);

    await deleteFile(filePath);
    expect(await Bun.file(filePath).exists()).toBe(false);
  });

  it("does not throw when deleting non-existent file", async () => {
    await expect(deleteFile("uploads/__test__/nope.png")).resolves.toBeUndefined();
  });
});

// ── fileToBase64 ──────────────────────────────────────────────────────────────

describe("fileToBase64", () => {
  it("returns valid base64 string", async () => {
    const file = new File([PNG_BYTES], "b64test.png", { type: "image/png" });
    const { filePath } = await saveUploadedFile(file, TEST_UPLOAD_DIR);

    const b64 = await fileToBase64(filePath);
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(0);

    // Round-trip: decode and compare
    const decoded = Buffer.from(b64, "base64");
    expect(decoded).toEqual(Buffer.from(PNG_BYTES));
  });
});
