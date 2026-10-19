"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useCreateTicket, useTicketCategories } from "@/hooks/useTickets"

const schema = z.object({
  title: z.string().min(3, "กรุณากรอกหัวข้ออย่างน้อย 3 ตัวอักษร"),
  category_id: z.string().min(1, "กรุณาเลือกหมวดหมู่"),
  message: z.string().min(10, "กรุณาอธิบายปัญหาอย่างน้อย 10 ตัวอักษร"),
})
type FormData = z.infer<typeof schema>

export default function NewTicketPage() {
  const router = useRouter()
  const { data: categories = [] } = useTicketCategories()
  const create = useCreateTicket()

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", category_id: "", message: "" },
  })

  const onSubmit = async (data: FormData) => {
    const ticket = await create.mutateAsync({ ...data, category_id: Number(data.category_id) })
    router.push(`/tickets/${ticket.id}`)
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-[28px] font-bold text-text-primary">เปิด Ticket ใหม่</h1>

      <div className="bg-surface border border-border rounded-[8px] p-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="category_id" render={({ field }) => (
              <FormItem>
                <FormLabel>หมวดหมู่</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="เลือกหมวดหมู่" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>หัวข้อปัญหา</FormLabel>
                <FormControl>
                  <Input placeholder="อธิบายปัญหาโดยย่อ" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="message" render={({ field }) => (
              <FormItem>
                <FormLabel>รายละเอียด</FormLabel>
                <FormControl>
                  <Textarea rows={5} placeholder="อธิบายปัญหาให้ละเอียดที่สุด..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex gap-3">
              <Button type="submit" className="rounded-[9999px]" disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                ส่ง Ticket
              </Button>
              <Button type="button" variant="outline" className="rounded-[9999px]" onClick={() => router.back()}>
                ยกเลิก
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
