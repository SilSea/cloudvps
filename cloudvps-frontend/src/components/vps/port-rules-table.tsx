"use client"

import { useState } from "react"
import { Plus, Trash2, Loader2, Shield } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { usePortRules } from "@/hooks/useVps"
import type { Protocol } from "@/types/nat"

const addRuleSchema = z.object({
  private_port: z.number().int().min(1).max(65535),
  protocol: z.enum(["TCP", "UDP", "BOTH"]),
})
type AddRuleInput = z.infer<typeof addRuleSchema>

export function PortRulesTable({ vpsId, privateIp }: { vpsId: number; privateIp: string }) {
  const { data, isLoading, add, remove } = usePortRules(vpsId)
  const rules = data?.port_rules ?? []
  const allocation = data?.nat_allocation
  const portLimitReached = allocation?.available_count === 0
  const [showForm, setShowForm] = useState(false)

  const form = useForm<AddRuleInput>({
    resolver: zodResolver(addRuleSchema),
    defaultValues: { private_port: undefined as unknown as number, protocol: "TCP" },
  })

  const onAdd = async (data: AddRuleInput) => {
    await add.mutateAsync({ ...data, private_ip: privateIp })
    form.reset()
    setShowForm(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-text-primary">Port Rules</h3>
          {allocation && (
            <p className="text-xs text-text-secondary mt-0.5">
              {allocation.public_ip} · ใช้แล้ว {allocation.used_count}/{allocation.port_end - allocation.port_start + 1} port
            </p>
          )}
        </div>
        <Button size="sm" className="rounded-[9999px] gap-1" onClick={() => setShowForm(!showForm)} disabled={portLimitReached}>
          <Plus className="h-3 w-3" /> เพิ่ม Rule
        </Button>
      </div>

      {portLimitReached && (
        <p className="text-xs text-secondary">ใช้ port ครบแล้ว ({allocation!.used_count}/{allocation!.port_end - allocation!.port_start + 1}) — ลบ rule เดิมก่อนเพิ่มใหม่</p>
      )}

      {showForm && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onAdd)} className="flex gap-2 items-start p-3 bg-background rounded-[8px] border border-border">
            <FormField
              control={form.control}
              name="private_port"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Private Port"
                      {...field}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="protocol"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(["TCP", "UDP", "BOTH"] as Protocol[]).map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <Button type="submit" size="sm" disabled={add.isPending} className="rounded-[9999px]">
              {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "เพิ่ม"}
            </Button>
          </form>
        </Form>
      )}

      <div className="rounded-[8px] border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Public Port</TableHead>
              <TableHead>Private Port</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-text-secondary py-4">กำลังโหลด...</TableCell></TableRow>
            ) : rules.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-text-secondary py-4">ยังไม่มี port rule</TableCell></TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono">{rule.public_port}</TableCell>
                  <TableCell className="font-mono">{rule.private_port}</TableCell>
                  <TableCell>{rule.protocol}</TableCell>
                  <TableCell>
                    {rule.is_system ? (
                      <Shield className="h-3 w-3 text-text-secondary" />
                    ) : (
                      <button
                        onClick={() => remove.mutate(rule.id)}
                        disabled={remove.isPending}
                        className="text-secondary hover:opacity-70 disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
