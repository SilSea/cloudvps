// Parse memory string "4GB" / "2048MB" / bare "4" (assumed GB) → integer GiB
export function parseGib(memory: string): number {
  const match = memory.match(/^(\d+(?:\.\d+)?)\s*(GB|MB)?/i);
  if (!match) return 1;
  const val = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  return unit === "MB" ? Math.round(val / 1024) : Math.round(val);
}

// Parse disk string "80GB" / "2TB" → integer GB
export function parseDiskGb(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(GB|TB)/i);
  if (!match) return 20;
  const val = parseFloat(match[1]);
  return match[2].toUpperCase() === "TB" ? Math.round(val * 1024) : Math.round(val);
}
