"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

const schema = z.object({ voucher_code: z.string().min(1, "กรุณากรอกรหัส Angpao") })
type Input = z.infer<typeof schema>

interface Props {
  onSubmit: (voucherCode: string) => Promise<void>
  isLoading?: boolean
}

export function TrueMoneyInput({ onSubmit, isLoading }: Props) {
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { voucher_code: "" } })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => onSubmit(d.voucher_code))} className="space-y-4">
        <FormField
          control={form.control}
          name="voucher_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>รหัส TrueMoney Angpao</FormLabel>
              <FormControl>
                <Input placeholder="กรอกรหัส Angpao" className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full rounded-[9999px]" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          ชำระเงิน
        </Button>
      </form>
    </Form>
  )
}
