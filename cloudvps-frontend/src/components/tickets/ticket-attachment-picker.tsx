"use client"

import { useRef } from "react"
import { Paperclip, X, ImageIcon } from "lucide-react"
import { toast } from "sonner"
import {
  TICKET_ATTACHMENT_MAX_FILES,
  TICKET_ATTACHMENT_MAX_SIZE,
  TICKET_ATTACHMENT_ACCEPT_TYPES,
} from "@/lib/constants"

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

export function TicketAttachmentPicker({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList) => {
    let next = files
    for (const f of Array.from(list)) {
      if (!TICKET_ATTACHMENT_ACCEPT_TYPES.includes(f.type as (typeof TICKET_ATTACHMENT_ACCEPT_TYPES)[number])) {
        toast.error(`${f.name}: รองรับเฉพาะ PNG, JPEG, WebP, GIF`)
        continue
      }
      if (f.size > TICKET_ATTACHMENT_MAX_SIZE) {
        toast.error(`${f.name}: ขนาดไฟล์ต้องไม่เกิน 5MB`)
        continue
      }
      if (next.length >= TICKET_ATTACHMENT_MAX_FILES) {
        toast.error(`แนบไฟล์ได้สูงสุด ${TICKET_ATTACHMENT_MAX_FILES} ไฟล์`)
        break
      }
      next = [...next, f]
    }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {files.map((f, i) => (
          <span
            key={`${f.name}-${i}`}
            className="inline-flex items-center gap-1 text-xs bg-background border border-border rounded-[9999px] pl-2 pr-1 py-1"
          >
            <ImageIcon className="h-3 w-3 text-text-secondary shrink-0" />
            <span className="max-w-[120px] truncate">{f.name}</span>
            <button
              type="button"
              onClick={() => onChange(files.filter((_, idx) => idx !== i))}
              className="text-text-secondary hover:text-secondary"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {files.length < TICKET_ATTACHMENT_MAX_FILES && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 text-xs text-text-secondary border border-dashed border-border rounded-[9999px] px-3 py-1 hover:border-primary disabled:opacity-50"
          >
            <Paperclip className="h-3 w-3" /> แนบไฟล์ ({files.length}/{TICKET_ATTACHMENT_MAX_FILES})
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
