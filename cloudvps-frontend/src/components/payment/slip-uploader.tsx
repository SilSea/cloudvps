"use client"

import { useRef, useState } from "react"
import { Upload, Loader2, ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SLIP_MAX_SIZE, SLIP_ACCEPT_TYPES } from "@/lib/constants"

interface Props {
  onSubmit: (file: File) => Promise<void>
  isLoading?: boolean
}

export function SlipUploader({ onSubmit, isLoading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const handleFile = (f: File) => {
    if (!SLIP_ACCEPT_TYPES.includes(f.type as (typeof SLIP_ACCEPT_TYPES)[number])) {
      toast.error("รองรับเฉพาะ PNG, JPEG, WebP, GIF")
      return
    }
    if (f.size > SLIP_MAX_SIZE) {
      toast.error("ขนาดไฟล์ต้องไม่เกิน 5MB")
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async () => {
    if (!file) return
    await onSubmit(file)
  }

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-[8px] p-8 text-center cursor-pointer hover:border-primary transition-colors"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="slip preview" className="max-h-48 mx-auto rounded-[4px] object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-secondary">
            <ImageIcon className="h-10 w-10" />
            <p className="text-sm">ลาก/วางสลิป หรือคลิกเพื่อเลือกไฟล์</p>
            <p className="text-xs">PNG, JPEG, WebP, GIF — ไม่เกิน 5MB</p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button
        className="w-full rounded-[9999px]"
        disabled={!file || isLoading}
        onClick={handleSubmit}
      >
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        ส่งสลิป
      </Button>
    </div>
  )
}
