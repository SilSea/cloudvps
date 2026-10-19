"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Tag, Pencil, ToggleLeft, ToggleRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import {
  useAdminTicketCategories,
  useCreateTicketCategory,
  useUpdateTicketCategory,
  useToggleTicketCategory,
} from "@/hooks/useTickets"
import { formatDate } from "@/lib/utils"
import type { TicketCategory } from "@/types/ticket"

const schema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อ"),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function TicketCategoriesPage() {
  const { data: categories = [], isLoading } = useAdminTicketCategories()
  const create = useCreateTicketCategory()
  const update = useUpdateTicketCategory()
  const toggle = useToggleTicketCategory()

  const [editing, setEditing] = useState<TicketCategory | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  })

  const onSubmit = async (data: FormData) => {
    if (editing) {
      await update.mutateAsync({ id: editing.id, data })
      setEditing(null)
    } else {
      await create.mutateAsync(data)
    }
    form.reset()
  }

  const startEdit = (cat: TicketCategory) => {
    setEditing(cat)
    form.reset({ name: cat.name, description: cat.description ?? "" })
  }

  const cancelEdit = () => {
    setEditing(null)
    form.reset()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Tag className="h-6 w-6 text-text-secondary" />
        <h1 className="text-[28px] font-bold text-text-primary">Ticket Categories</h1>
      </div>

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
        <h2 className="font-medium text-text-primary">
          {editing ? `แก้ไข: ${editing.name}` : "เพิ่มหมวดหมู่ใหม่"}
        </h2>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>ชื่อหมวดหมู่</FormLabel>
                <FormControl><Input placeholder="เช่น Billing, Technical, Account" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>คำอธิบาย (ไม่บังคับ)</FormLabel>
                <FormControl><Textarea rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-2">
              <Button type="submit" className="rounded-[9999px]" size="sm" disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "บันทึก" : "สร้าง"}
              </Button>
              {editing && (
                <Button type="button" variant="outline" className="rounded-[9999px]" size="sm" onClick={cancelEdit}>
                  ยกเลิก
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[8px]" />)}</div>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-surface border border-border rounded-[8px] p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-text-primary text-sm">{cat.name}</p>
                  <Badge variant="outline" className={`text-xs rounded-[9999px] ${cat.status ? "bg-accent-green/10 text-accent-green border-accent-green/20" : "bg-text-secondary/10 text-text-secondary border-text-secondary/20"}`}>
                    {cat.status ? "ใช้งาน" : "ปิดใช้"}
                  </Badge>
                </div>
                {cat.description && <p className="text-xs text-text-secondary mt-0.5 truncate">{cat.description}</p>}
                <p className="text-xs text-text-secondary mt-0.5">{formatDate(cat.updated_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => startEdit(cat)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(cat.id)}
                >
                  {cat.status
                    ? <ToggleRight className="h-4 w-4 text-accent-green" />
                    : <ToggleLeft className="h-4 w-4 text-text-secondary" />}
                </Button>
              </div>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-center py-8 text-text-secondary text-sm">ยังไม่มีหมวดหมู่</p>
          )}
        </div>
      )}
    </div>
  )
}
