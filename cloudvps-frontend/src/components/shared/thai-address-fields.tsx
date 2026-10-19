"use client"

import { useMemo, useState } from "react"
import { useWatch, type Control, type UseFormSetValue, type FieldValues } from "react-hook-form"
import { Check, ChevronsUpDown } from "lucide-react"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getProvinces, getDistricts, getSubdistricts, getZipcode } from "@/lib/thai-address"

interface ThaiAddressFieldsProps {
  control: Control<FieldValues>
  setValue: UseFormSetValue<FieldValues>
  labelSize?: "sm" | "default"
}

interface AddressComboboxProps {
  value: string
  options: string[]
  placeholder: string
  disabled?: boolean
  onChange: (v: string) => void
}

function AddressCombobox({ value, options, placeholder, disabled, onChange }: AddressComboboxProps) {
  const [open, setOpen] = useState(false)
  const listId = `combobox-list-${placeholder.replace(/\s/g, "-")}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm",
            "placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-text-secondary",
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
      >
        <Command>
          <CommandInput placeholder="ค้นหา..." />
          <CommandList id={listId}>
            <CommandEmpty>ไม่พบข้อมูล</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(v) => {
                    onChange(v === value ? "" : v)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ThaiAddressFields({ control, setValue, labelSize = "default" }: ThaiAddressFieldsProps) {
  const [province, district, subdistrict] = useWatch({
    control,
    name: ["address6", "address4", "address3"],
  }) as [string | undefined, string | undefined, string | undefined]

  const provinces = useMemo(() => getProvinces(), [])
  const districts = useMemo(() => (province ? getDistricts(province) : []), [province])
  const subdistricts = useMemo(
    () => (province && district ? getSubdistricts(province, district) : []),
    [province, district],
  )

  const labelClass = labelSize === "sm" ? "text-xs text-text-secondary" : undefined

  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField
        control={control}
        name="address6"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={labelClass}>จังหวัด</FormLabel>
            <FormControl>
              <AddressCombobox
                value={field.value ?? ""}
                options={provinces}
                placeholder="เลือกจังหวัด"
                onChange={(v) => {
                  field.onChange(v)
                  setValue("address4", "")
                  setValue("address3", "")
                  setValue("address5", "")
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="address4"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={labelClass}>อำเภอ/เขต</FormLabel>
            <FormControl>
              <AddressCombobox
                value={field.value ?? ""}
                options={districts}
                placeholder={province ? "เลือกอำเภอ/เขต" : "เลือกจังหวัดก่อน"}
                disabled={!province}
                onChange={(v) => {
                  field.onChange(v)
                  setValue("address3", "")
                  setValue("address5", "")
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="address3"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={labelClass}>ตำบล/แขวง</FormLabel>
            <FormControl>
              <AddressCombobox
                value={field.value ?? ""}
                options={subdistricts}
                placeholder={district ? "เลือกตำบล/แขวง" : "เลือกอำเภอก่อน"}
                disabled={!district}
                onChange={(v) => {
                  field.onChange(v)
                  setValue("address5", getZipcode(province ?? "", district ?? "", v))
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="address5"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={labelClass}>รหัสไปรษณีย์</FormLabel>
            <FormControl>
              <Input
                placeholder="อัตโนมัติ"
                readOnly={!!subdistrict}
                className={subdistrict ? "bg-surface/50 text-text-secondary" : ""}
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
