import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@")
  if (!user || !domain) return email
  return `${user[0]}***@${domain}`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

export function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date))
}

export function getDaysUntil(date: string | Date): number {
  const now = new Date()
  const target = new Date(date)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function isExpiringSoon(date: string | Date, threshold = 3): boolean {
  return getDaysUntil(date) <= threshold
}

/** Parse "4GB" / "2048MB" → GiB integer */
export function parseGib(memory: string): number {
  const match = memory.match(/^(\d+(?:\.\d+)?)\s*(GB|MB)/i)
  if (!match) return 1
  const val = parseFloat(match[1])
  return match[2].toUpperCase() === "GB" ? Math.round(val) : Math.round(val / 1024)
}

/** Parse "80GB" / "2TB" → GB integer */
export function parseDiskGb(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(GB|TB)/i)
  if (!match) return 20
  const val = parseFloat(match[1])
  return match[2].toUpperCase() === "TB" ? Math.round(val * 1024) : Math.round(val)
}

// Uploaded files (slips, ticket attachments) are served by the backend, not the frontend origin —
// "/uploads/..." paths must be prefixed with the API base URL. Raw base64 (payment.slip_mode=BASE64)
// has no prefix — detect mime from magic bytes and build a data URI.
export function toUploadSrc(url: string): string {
  if (!url || url.startsWith("http") || url.startsWith("data:")) return url
  if (url.startsWith("/")) return `${process.env.NEXT_PUBLIC_API_URL ?? ""}${url}`
  const mime = url.startsWith("/9j/")
    ? "image/jpeg"
    : url.startsWith("R0lGOD")
      ? "image/gif"
      : url.startsWith("UklGR")
        ? "image/webp"
        : "image/png"
  return `data:${mime};base64,${url}`
}

export const toSlipSrc = toUploadSrc

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
