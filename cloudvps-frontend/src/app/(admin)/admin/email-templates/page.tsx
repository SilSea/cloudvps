"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Mail, Pencil, CheckCircle2, Circle, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useEmailTemplates, useUpdateEmailTemplate, useToggleEmailTemplate } from "@/hooks/useAdmin"
import { EMAIL_TEMPLATE_LABELS } from "@/types/email-template"
import type { EmailTemplate, EmailTemplateType } from "@/types/email-template"
import { formatDate } from "@/lib/utils"

const editSchema = z.object({
  subject: z.string().min(1, "กรุณากรอก subject"),
  body_html: z.string().min(1, "กรุณากรอก HTML"),
})
type EditForm = z.infer<typeof editSchema>

export default function EmailTemplatesPage() {
  const { data: templates = [], isLoading } = useEmailTemplates()
  const updateTpl = useUpdateEmailTemplate()
  const toggleTpl = useToggleEmailTemplate()

  const [editTarget, setEditTarget] = useState<EmailTemplate | null>(null)

  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { subject: "", body_html: "" },
  })

  const openEdit = (tpl: EmailTemplate) => {
    setEditTarget(tpl)
    form.reset({ subject: tpl.subject, body_html: tpl.body_html })
  }

  const onSubmit = async (d: EditForm) => {
    if (!editTarget) return
    await updateTpl.mutateAsync({ type: editTarget.type as EmailTemplateType, data: d })
    setEditTarget(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-primary" />
        <h1 className="text-[28px] font-bold text-text-primary">Email Templates</h1>
      </div>

      <p className="text-sm text-text-secondary">
        แก้ไข HTML template สำหรับอีเมลแต่ละประเภท — ถ้าไม่เปิดใช้งานระบบจะใช้ default template
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <TemplateRow
              key={tpl.type}
              tpl={tpl}
              onEdit={() => openEdit(tpl)}
              onToggle={(v) => toggleTpl.mutate({ type: tpl.type as EmailTemplateType, is_active: v })}
              isToggling={toggleTpl.isPending}
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{editTarget ? EMAIL_TEMPLATE_LABELS[editTarget.type as EmailTemplateType] : ""}</span>
              <Badge variant="outline" className="text-xs font-mono">{editTarget?.type}</Badge>
            </DialogTitle>
          </DialogHeader>

          {editTarget && (
            <div className="mb-3 p-3 bg-background rounded-[8px] border border-border">
              <p className="text-xs font-medium text-text-secondary mb-1.5">ตัวแปรที่ใช้ได้:</p>
              <div className="flex flex-wrap gap-1.5">
                {editTarget.variables.map((v) => (
                  <code key={v} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-[4px]">
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="subject" render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="หัวข้ออีเมล" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="body_html" render={({ field }) => (
                <FormItem>
                  <FormLabel>Body HTML</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="<html>...</html>"
                      className="font-mono text-xs min-h-[320px] resize-y"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[9999px] bg-surface border-text-secondary/30"
                  onClick={() => setEditTarget(null)}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  ยกเลิก
                </Button>
                <Button type="submit" className="rounded-[9999px]" disabled={updateTpl.isPending}>
                  {updateTpl.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  บันทึก
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateRow({
  tpl,
  onEdit,
  onToggle,
  isToggling,
}: {
  tpl: EmailTemplate
  onEdit: () => void
  onToggle: (v: boolean) => void
  isToggling: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4 bg-surface border border-border rounded-[8px]">
      <div className="flex items-center gap-3 min-w-0">
        {tpl.is_active ? (
          <CheckCircle2 className="h-4 w-4 text-accent-green shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-border shrink-0" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-text-primary">
              {EMAIL_TEMPLATE_LABELS[tpl.type as EmailTemplateType]}
            </p>
            <Badge variant="outline" className="text-[10px] font-mono rounded-[4px] px-1.5 py-0">{tpl.type}</Badge>
            {tpl.from_db ? (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30 rounded-[4px] px-1.5 py-0">Custom</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-text-secondary rounded-[4px] px-1.5 py-0">Default</Badge>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5 truncate">{tpl.subject}</p>
          {tpl.updated_by && tpl.updated_at && (
            <p className="text-[10px] text-text-secondary mt-0.5">
              แก้ไขโดย {tpl.updated_by.email} · {formatDate(tpl.updated_at)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Switch
          checked={tpl.is_active}
          onCheckedChange={onToggle}
          disabled={isToggling}
        />
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
