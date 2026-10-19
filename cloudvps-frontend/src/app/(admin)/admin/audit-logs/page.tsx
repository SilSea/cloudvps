"use client"

import { useState } from "react"
import { Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Pagination } from "@/components/shared/pagination"
import { useAuditLogs } from "@/hooks/useAdmin"
import { formatDate } from "@/lib/utils"

const PAGE_SIZE = 20

const AUDIT_DESCRIPTIONS: Record<string, string> = {
  "USER:ENABLE": "เปิดใช้งานผู้ใช้",
  "USER:DISABLE": "ปิดใช้งานผู้ใช้",
  "USER:CHANGE_ROLE": "เปลี่ยนบทบาทผู้ใช้",
  "USER:UPDATE": "แก้ไขข้อมูลผู้ใช้",
  "USER:DELETE": "ลบผู้ใช้",
  "VPS:START": "เปิด VPS",
  "VPS:STOP": "ปิด VPS",
  "VPS:REBOOT": "รีบูต VPS",
  "VPS:FORCE_DELETE": "ลบ VPS แบบ Force",
  "VPS:UPDATE": "แก้ไขข้อมูล VPS",
  "TRANSACTION:APPROVE": "อนุมัติธุรกรรม",
  "TRANSACTION:REJECT": "ปฏิเสธธุรกรรม",
  "ORDER:UPDATE": "อัปเดตคำสั่งซื้อ",
  "SYSTEM_CONFIG:UPDATE": "แก้ไขค่าระบบ",
  "BROADCAST:CREATE": "ส่ง Email Broadcast",
  "PACKAGE:CREATE": "สร้างแพ็กเกจใหม่",
  "PACKAGE:UPDATE": "แก้ไขแพ็กเกจ",
  "PACKAGE:DELETE": "ลบแพ็กเกจ",
  "PACKAGE:ENABLE": "เปิดแพ็กเกจ",
  "PACKAGE:DISABLE": "ปิดแพ็กเกจ",
  "PACKAGE_CATEGORY:CREATE": "สร้างหมวดหมู่แพ็กเกจ",
  "PACKAGE_CATEGORY:UPDATE": "แก้ไขหมวดหมู่",
  "PACKAGE_CATEGORY:DELETE": "ลบหมวดหมู่",
  "VPS_TEMPLATE:CREATE": "สร้าง OS Template",
  "VPS_TEMPLATE:UPDATE": "แก้ไข OS Template",
  "VPS_TEMPLATE:DELETE": "ลบ OS Template",
  "VM_SPEC:CREATE": "สร้าง VM Spec",
  "VM_SPEC:UPDATE": "แก้ไข VM Spec",
  "VM_SPEC:DELETE": "ลบ VM Spec",
  "IP_POOL:CREATE": "เพิ่ม IP Pool",
  "IP_POOL:UPDATE": "แก้ไข IP Pool",
  "IP_POOL:ENABLE": "เปิดใช้งาน IP",
  "IP_POOL:DISABLE": "ปิดใช้งาน IP",
  "IP_POOL:DELETE": "ลบ IP Pool",
  "PROMOTION:CREATE": "สร้างโปรโมชั่น",
  "PROMOTION:UPDATE": "แก้ไขโปรโมชั่น",
  "PROMOTION:DELETE": "ลบโปรโมชั่น",
  "PROMOTION:ENABLE": "เปิดโปรโมชั่น",
  "PROMOTION:DISABLE": "ปิดโปรโมชั่น",
  "POLICY:CREATE": "สร้าง Policy",
  "POLICY:UPDATE": "อัปเดต Policy",
  "POLICY:ENABLE": "เปิดใช้งาน Policy",
  "PORT_RULE:CREATE": "เพิ่ม Port Rule",
  "PORT_RULE:DELETE": "ลบ Port Rule",
}

function describeAuditLog(entity: string, action: string): string {
  return AUDIT_DESCRIPTIONS[`${entity}:${action}`] ?? ""
}

const ENTITY_OPTIONS = [
  "USER", "VPS", "ORDER", "TRANSACTION", "SYSTEM_CONFIG",
  "BROADCAST", "PACKAGE", "PACKAGE_CATEGORY", "VPS_TEMPLATE",
  "VM_SPEC", "IP_POOL", "PROMOTION", "POLICY", "PORT_RULE",
]

const ACTION_OPTIONS = [
  "CREATE", "UPDATE", "DELETE", "ENABLE", "DISABLE",
  "APPROVE", "REJECT", "CHANGE_ROLE", "FORCE_DELETE",
]

export default function AuditLogsPage() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState("")
  const [action, setAction] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const { data, isLoading } = useAuditLogs({
    page,
    limit: PAGE_SIZE,
    entity: entity || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
  })

  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const resetFilters = () => {
    setPage(1)
    setEntity("")
    setAction("")
    setFrom("")
    setTo("")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-text-secondary" />
        <div>
          <h1 className="text-[28px] font-bold text-text-primary">Audit Log</h1>
          <p className="text-sm text-text-secondary mt-0.5">ประวัติการกระทำของ Admin / Support ทั้งหมด</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-border rounded-[8px]">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Entity</label>
          <select
            value={entity}
            onChange={(e) => { setEntity(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
          >
            <option value="">ทั้งหมด</option>
            {ENTITY_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Action</label>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
          >
            <option value="">ทั้งหมด</option>
            {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">จาก</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">ถึง</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" variant="outline" className="rounded-[9999px]" onClick={resetFilters}>
          ล้าง
        </Button>
        {total > 0 && (
          <span className="text-xs text-text-secondary ml-auto">
            พบ {total.toLocaleString()} รายการ
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-[8px]" />)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Actor</th>
                <th className="py-3 pr-4 font-medium">Role</th>
                <th className="py-3 pr-4 font-medium">Action</th>
                <th className="py-3 pr-4 font-medium">Entity</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Target User</th>
                <th className="py-3 pr-4 font-medium">IP</th>
                <th className="py-3 font-medium whitespace-nowrap">เวลา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-surface/50">
                  <td className="py-3 pr-4">
                    <p className="text-xs font-medium text-text-primary">
                      {log.actor?.email ?? `#${log.actor_id}`}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline" className="text-xs rounded-[9999px] uppercase">
                      {log.actor_role}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-mono text-xs font-semibold text-accent-yellow">
                      {log.action}
                    </span>
                    {describeAuditLog(log.entity, log.action) && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        {describeAuditLog(log.entity, log.action)}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-text-primary">{log.entity}</span>
                      {log.entity_id != null && (
                        <span className="text-xs text-text-secondary">#{log.entity_id}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-text-secondary">
                    {log.target_user?.email ?? (log.target_user_id != null ? `#${log.target_user_id}` : "—")}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-text-secondary">
                    {log.ip_address ?? "—"}
                  </td>
                  <td className="py-3 text-xs text-text-secondary whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <p className="text-center py-10 text-text-secondary text-sm">ไม่พบ log</p>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
