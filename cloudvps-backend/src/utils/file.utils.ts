import { mkdir } from "node:fs/promises";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

export interface AttachmentMeta {
  name: string;
  mime_type: string;
  url: string;
  size: number;
}

export function validateFile(
  file: File,
  config: { maxSizeMB: number; allowedTypes: string[] }
): "FILE_TOO_LARGE" | "INVALID_FILE_TYPE" | null {
  if (file.size > config.maxSizeMB * 1024 * 1024) return "FILE_TOO_LARGE";
  if (!config.allowedTypes.includes(file.type)) return "INVALID_FILE_TYPE";
  return null;
}

export async function saveUploadedFile(
  file: File,
  baseDir: string
): Promise<{ url: string; filePath: string; size: number; mimeType: string }> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = join(baseDir, yearMonth);

  await mkdir(dir, { recursive: true });

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = join(dir, filename);

  const buffer = await file.arrayBuffer();
  await Bun.write(filePath, buffer);

  // Normalise to forward-slash URL regardless of OS
  const url = `/${baseDir.replace(/\\/g, "/")}/${yearMonth}/${filename}`;

  return { url, filePath, size: file.size, mimeType: file.type };
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // ignore — file may not exist
  }
}

export async function fileToBase64(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
