"use client"

import { useState } from "react"
import { Loader2, Eye, EyeOff, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { useSystemConfigs, useUpdateSystemConfig, useFlushCache } from "@/hooks/useAdmin"

// Per-OS default cloud-init/password-change user (backend frontend.md rev 11) — shown as a
// dedicated card instead of the generic key list since the two keys are logically one setting.
const DEFAULT_USER_KEYS = ["proxmox.default_user.linux", "proxmox.default_user.windows"] as const
const DEFAULT_USER_LABELS: Record<string, string> = {
  "proxmox.default_user.linux": "Linux VMs",
  "proxmox.default_user.windows": "Windows VMs",
}

// Backend already orders configs by category asc, key asc — group them into labeled
// sections instead of one long flat list.
const CATEGORY_LABELS: Record<string, string> = {
  proxmox: "Proxmox VE",
  pricing: "Pricing (Custom Upgrade)",
  mikrotik: "MikroTik CHR (NAT)",
  capacity: "Capacity Lock",
  payment: "Payment",
}

export default function SystemConfigsPage() {
  const { data: configs = [], isLoading } = useSystemConfigs()
  const update = useUpdateSystemConfig()
  const flushCache = useFlushCache()
  const [values, setValues] = useState<Record<string, string>>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState("")
  const [confirmFlush, setConfirmFlush] = useState(false)

  const getValue = (key: string, original: string | null) =>
    values[key] !== undefined ? values[key] : (original ?? "")

  const defaultUserConfigs = DEFAULT_USER_KEYS
    .map((key) => configs.find((c) => c.key === key))
    .filter((c) => c != null)

  const filtered = configs
    .filter((c) => !(DEFAULT_USER_KEYS as readonly string[]).includes(c.key))
    .filter((c) => c.key.toLowerCase().includes(search.toLowerCase()))

  // Preserves the backend's category-asc/key-asc ordering — just splits it into sections.
  const grouped = new Map<string, typeof filtered>()
  for (const cfg of filtered) {
    const arr = grouped.get(cfg.category)
    if (arr) arr.push(cfg)
    else grouped.set(cfg.category, [cfg])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">ค่าระบบ</h1>
        <Button size="sm" variant="outline" className="rounded-[9999px] gap-1 text-secondary border-secondary/30 hover:bg-secondary/10"
          onClick={() => setConfirmFlush(true)} disabled={flushCache.isPending}>
          <Trash2 className="h-3.5 w-3.5" /> ล้าง Cache
        </Button>
      </div>

      {!isLoading && defaultUserConfigs.length > 0 && (
        <div className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
          <h2 className="font-medium text-text-primary text-sm">Default OS Username</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {defaultUserConfigs.map((cfg) => (
              <div key={cfg.key} className="space-y-1.5">
                <label className="text-xs text-text-secondary">{DEFAULT_USER_LABELS[cfg.key] ?? cfg.key}</label>
                <div className="flex gap-2">
                  <Input
                    value={getValue(cfg.key, cfg.value)}
                    onChange={(e) => setValues((v) => ({ ...v, [cfg.key]: e.target.value }))}
                    placeholder={cfg.description ?? undefined}
                    className="h-8 text-sm font-mono"
                  />
                  <Button
                    size="sm"
                    className="rounded-[9999px] gap-1 shrink-0"
                    disabled={getValue(cfg.key, cfg.value) === (cfg.value ?? "") || update.isPending}
                    onClick={() => update.mutate({ key: cfg.key, value: getValue(cfg.key, cfg.value) })}
                  >
                    {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-secondary">
            ใช้เป็น cloud-init user ตอน provision VPS และ target user ตอนเปลี่ยนรหัสผ่าน — เปลี่ยนหลัง provision แล้วไม่มีผลย้อนหลัง (VPS ที่ provision ไปแล้วยังใช้ username เดิม)
          </p>
        </div>
      )}

      <input
        type="search"
        placeholder="ค้นหา key..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-xs px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary"
      />

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 rounded-[8px]" />)}</div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category} className="space-y-3">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <div className="space-y-3">
                {items.map((cfg) => (
                  <div key={cfg.key} className="bg-surface border border-border rounded-[8px] p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-text-secondary mb-1">{cfg.key}</p>
                      {cfg.description && (
                        <p className="text-[11px] text-text-secondary/70 mb-1">{cfg.description}</p>
                      )}
                      <div className="flex gap-2">
                        <Input
                          type={cfg.is_secret && !shown[cfg.key] ? "password" : "text"}
                          value={getValue(cfg.key, cfg.value)}
                          onChange={(e) => setValues((v) => ({ ...v, [cfg.key]: e.target.value }))}
                          placeholder={cfg.description ?? undefined}
                          className="h-8 text-sm font-mono"
                        />
                        {cfg.is_secret && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setShown((s) => ({ ...s, [cfg.key]: !s[cfg.key] }))}
                          >
                            {shown[cfg.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="rounded-[9999px] gap-1 shrink-0"
                      disabled={getValue(cfg.key, cfg.value) === (cfg.value ?? "") || update.isPending}
                      onClick={() => update.mutate({ key: cfg.key, value: getValue(cfg.key, cfg.value) })}
                    >
                      {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      บันทึก
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center py-10 text-text-secondary text-sm">{configs.length === 0 ? "ไม่มีค่าระบบ" : "ไม่พบค่าระบบที่ค้นหา"}</p>}
        </div>
      )}
      <ConfirmDialog
        open={confirmFlush}
        title="ล้าง Cache"
        description="จะล้าง Redis cache keys ทั้งหมด (rate limits, syscfg, user_status, provision locks)"
        confirmLabel="ล้าง Cache"
        isPending={flushCache.isPending}
        onConfirm={() => { flushCache.mutate(); setConfirmFlush(false) }}
        onCancel={() => setConfirmFlush(false)}
      />
    </div>
  )
}
