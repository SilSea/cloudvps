"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UserService } from "@/services/api/users"
import { OrderService } from "@/services/api/orders"
import { PackageService, type CreatePackageInput, type UpdatePackageInput, type CreateCategoryInput, type UpdateCategoryInput } from "@/services/api/packages"
import { TransactionService } from "@/services/api/transactions"
import { SystemConfigService } from "@/services/api/system-configs"
import { BroadcastService, type CreateBroadcastInput } from "@/services/api/broadcasts"
import { PolicyService, type CreatePolicyInput } from "@/services/api/policies"
import { PromotionService, type CreatePromotionInput, type UpdatePromotionInput } from "@/services/api/promotions"
import { IpPoolService } from "@/services/api/ip-pools"
import type { IpType } from "@/services/api/ip-pools"
import { AuditLogService } from "@/services/api/audit-logs"
import type { AuditLogFilters } from "@/types/audit-log"
import { EmailTemplateService } from "@/services/api/email-templates"
import type { UpdateEmailTemplateInput, EmailTemplateType } from "@/types/email-template"
import { VpsService } from "@/services/api/vps"
import type { ConfirmVpsPasswordChangeInput } from "@/types/vps"
import { SystemService } from "@/services/api/system"
import { UpgradeService } from "@/services/api/upgrade"
import type { UpgradePackageInput, UpgradeCustomInput, UpgradeResult } from "@/services/api/upgrade"
import { useAuth } from "./useAuth"
import { parseGib, parseDiskGb } from "@/lib/utils"

// Users
export function useAdminCreateUser() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: import("@/types/user").AdminCreateUserInput) =>
      UserService.adminCreate(data, accessToken!),
    onSuccess: () => {
      toast.success("สร้างบัญชีผู้ใช้แล้ว")
      qc.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAdminUsers() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: () => UserService.listAll(accessToken!),
    enabled: !!accessToken,
  })
}

export function useUpdateUser() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: import("@/types/user").UpdateProfileInput }) =>
      UserService.updateUser(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดตข้อมูลแล้ว"); qc.invalidateQueries({ queryKey: ["admin-users"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useToggleUserActive() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => UserService.toggleActive(id, accessToken!),
    onSuccess: () => { toast.success("อัปเดตสถานะแล้ว"); qc.invalidateQueries({ queryKey: ["admin-users"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useChangeUserRole() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => UserService.changeRole(id, role, accessToken!),
    onSuccess: () => { toast.success("เปลี่ยนบทบาทแล้ว"); qc.invalidateQueries({ queryKey: ["admin-users"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Orders
export function useAdminOrders() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => OrderService.list(accessToken!),
    enabled: !!accessToken,
  })
}

// Categories
export function useAdminCategories() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => PackageService.listCategoriesAdmin(accessToken!),
    enabled: !!accessToken,
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  })
}

export function useCreateCategory() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCategoryInput) => PackageService.createCategory(data, accessToken!),
    onSuccess: () => { toast.success("สร้างหมวดหมู่แล้ว"); qc.invalidateQueries({ queryKey: ["admin-categories"] }); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateCategory() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryInput }) => PackageService.updateCategory(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดตหมวดหมู่แล้ว"); qc.invalidateQueries({ queryKey: ["admin-categories"] }); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useToggleCategoryStatus() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => PackageService.toggleCategoryStatus(id, accessToken!),
    onSuccess: () => { toast.success("อัปเดตสถานะแล้ว"); qc.invalidateQueries({ queryKey: ["admin-categories"] }); qc.invalidateQueries({ queryKey: ["categories"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Packages
export function useAdminPackages() {
  return useQuery({
    queryKey: ["admin-packages"],
    queryFn: () => PackageService.list(),
  })
}

export function useOsTemplates() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["os-templates"],
    queryFn: () => PackageService.listOsTemplates(accessToken!),
    enabled: !!accessToken,
    select: (data) => [...data].sort((a, b) => a.os_name.localeCompare(b.os_name) || a.os_version.localeCompare(b.os_version)),
  })
}

export function useVmSpecs() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vm-specs"],
    queryFn: () => PackageService.listVmSpecs(accessToken!),
    enabled: !!accessToken,
    select: (data) => [...data].sort((a, b) =>
      a.core - b.core || parseGib(a.memory) - parseGib(b.memory) || parseDiskGb(a.size) - parseDiskGb(b.size)
    ),
  })
}

export function useCreatePackage() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePackageInput) => PackageService.create(data, accessToken!),
    onSuccess: () => { toast.success("สร้างแพ็กเกจแล้ว"); qc.invalidateQueries({ queryKey: ["admin-packages"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePackage() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePackageInput }) => PackageService.update(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดตแพ็กเกจแล้ว"); qc.invalidateQueries({ queryKey: ["admin-packages"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePackage() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => PackageService.remove(id, accessToken!),
    onSuccess: () => { toast.success("ลบแพ็กเกจแล้ว"); qc.invalidateQueries({ queryKey: ["admin-packages"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Package groups (REQ-F3.9) — a "group" is a frontend-only concept (spec-key match,
// see src/lib/packageGroup.ts): one Package row per OS variant, no backend group entity.
// Each OS-variant request is independent, so failures are reported per-batch rather than
// rolled back (there is no server-side transaction spanning the group).

type PackageGroupSpec = Omit<CreatePackageInput, "os_id"> & { status?: boolean }

// Backend create/PUT don't accept `status` — the only way to change it is the dedicated
// PATCH /:id/status toggle. Reconcile each row toward the form's desired status here.
async function reconcileGroupStatus(
  rows: { id: number; status: boolean }[],
  desired: boolean | undefined,
  token: string,
): Promise<PromiseSettledResult<unknown>[]> {
  if (desired === undefined) return []
  return Promise.allSettled(
    rows.filter((r) => r.status !== desired).map((r) => PackageService.toggleStatus(r.id, token))
  )
}

const countFailed = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((r) => r.status === "rejected").length

export function useCreatePackageGroup() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ spec, osIds }: { spec: PackageGroupSpec; osIds: number[] }) => {
      const results = await Promise.allSettled(
        osIds.map((os_id) => PackageService.create({ ...spec, os_id }, accessToken!))
      )
      const created = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof PackageService.create>>> => r.status === "fulfilled").map((r) => r.value)
      const toggles = await reconcileGroupStatus(created, spec.status, accessToken!)
      return {
        total: osIds.length + toggles.length,
        failed: countFailed(results) + countFailed(toggles),
      }
    },
    onSuccess: ({ total, failed }) => {
      qc.invalidateQueries({ queryKey: ["admin-packages"] })
      if (failed === 0) toast.success(`สร้างกลุ่มแพ็กเกจแล้ว`)
      else if (failed === total) toast.error("สร้างแพ็กเกจล้มเหลวทั้งหมด")
      else toast.error(`สร้างสำเร็จบางส่วน (ล้มเหลว ${failed}/${total} รายการ)`)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePackageGroup() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ spec, toCreate, toUpdate, toRemove }: {
      spec: PackageGroupSpec
      toCreate: number[] // os_ids to add as new variants
      toUpdate: { id: number; status: boolean }[] // existing variants to sync spec onto (os_id untouched)
      toRemove: number[] // existing package ids to delete
    }) => {
      const createResults = await Promise.allSettled(
        toCreate.map((os_id) => PackageService.create({ ...spec, os_id }, accessToken!))
      )
      const otherResults = await Promise.allSettled([
        ...toUpdate.map(({ id }) => PackageService.update(id, spec, accessToken!)),
        ...toRemove.map((id) => PackageService.remove(id, accessToken!)),
      ])
      const created = createResults.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof PackageService.create>>> => r.status === "fulfilled").map((r) => r.value)
      const toggles = await reconcileGroupStatus([...created, ...toUpdate], spec.status, accessToken!)
      return {
        total: createResults.length + otherResults.length + toggles.length,
        failed: countFailed(createResults) + countFailed(otherResults) + countFailed(toggles),
      }
    },
    onSuccess: ({ total, failed }) => {
      qc.invalidateQueries({ queryKey: ["admin-packages"] })
      if (failed === 0) toast.success("อัปเดตกลุ่มแพ็กเกจแล้ว")
      else if (failed === total) toast.error("อัปเดตแพ็กเกจล้มเหลวทั้งหมด")
      else toast.error(`อัปเดตสำเร็จบางส่วน (ล้มเหลว ${failed}/${total} รายการ)`)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeletePackageGroup() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => PackageService.remove(id, accessToken!)))
      return { total: ids.length, failed: results.filter((r) => r.status === "rejected").length }
    },
    onSuccess: ({ total, failed }) => {
      qc.invalidateQueries({ queryKey: ["admin-packages"] })
      if (failed === 0) toast.success(`ลบกลุ่มแพ็กเกจแล้ว (${total} รายการ)`)
      else toast.error(`ลบสำเร็จบางส่วน (ล้มเหลว ${failed}/${total} รายการ)`)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Transactions
export function useAdminTransactions() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-transactions"],
    queryFn: () => TransactionService.list(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 10000,
  })
}

export function useApproveTransaction() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => TransactionService.approve(id, accessToken!),
    onSuccess: () => { toast.success("อนุมัติแล้ว"); qc.invalidateQueries({ queryKey: ["admin-transactions"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRejectTransaction() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => TransactionService.reject(id, accessToken!),
    onSuccess: () => { toast.success("ปฏิเสธแล้ว"); qc.invalidateQueries({ queryKey: ["admin-transactions"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// System Configs
export function useSystemConfigs() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["system-configs"],
    queryFn: () => SystemConfigService.list(accessToken!),
    enabled: !!accessToken,
  })
}

export function useUpdateSystemConfig() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | null }) => SystemConfigService.update(key, value, accessToken!),
    onSuccess: () => { toast.success("บันทึกแล้ว"); qc.invalidateQueries({ queryKey: ["system-configs"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useFlushCache() {
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: () => SystemConfigService.flushCache(accessToken!),
    onSuccess: () => toast.success("ล้าง Cache แล้ว"),
    onError: (e: Error) => toast.error(e.message),
  })
}

// Broadcasts
export function useAdminBroadcasts() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => BroadcastService.list(accessToken!),
    enabled: !!accessToken,
    select: (d) => d.broadcasts,
  })
}

export function useSendBroadcast() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBroadcastInput) => BroadcastService.send(data, accessToken!),
    onSuccess: () => { toast.success("ส่งแล้ว"); qc.invalidateQueries({ queryKey: ["broadcasts"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Policies
export function useAdminPolicies() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-policies"],
    queryFn: () => PolicyService.list(accessToken!),
    enabled: !!accessToken,
  })
}

export function useCreatePolicy() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePolicyInput) => PolicyService.create(data, accessToken!),
    onSuccess: () => { toast.success("สร้าง Policy แล้ว"); qc.invalidateQueries({ queryKey: ["admin-policies"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePolicy() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof PolicyService.update>[1] }) =>
      PolicyService.update(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดต Policy แล้ว"); qc.invalidateQueries({ queryKey: ["admin-policies"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useActivatePolicy() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => PolicyService.toggleStatus(id, accessToken!),
    onSuccess: () => { toast.success("อัปเดตสถานะแล้ว"); qc.invalidateQueries({ queryKey: ["admin-policies"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Promotions
export function useAdminPromotions() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () => PromotionService.list(accessToken!),
    enabled: !!accessToken,
  })
}

export function useCreatePromotion() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePromotionInput) => PromotionService.create(data, accessToken!),
    onSuccess: () => { toast.success("สร้างโปรโมชั่นแล้ว"); qc.invalidateQueries({ queryKey: ["admin-promotions"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdatePromotion() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePromotionInput }) => PromotionService.update(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดตโปรโมชั่นแล้ว"); qc.invalidateQueries({ queryKey: ["admin-promotions"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useTogglePromotion() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => PromotionService.toggleStatus(id, accessToken!),
    onSuccess: () => { toast.success("อัปเดตแล้ว"); qc.invalidateQueries({ queryKey: ["admin-promotions"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}


// OS Templates
export function useCreateOs() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { os_name: string; os_version: string; vmid: number }) =>
      PackageService.createOs(data, accessToken!),
    onSuccess: () => { toast.success("สร้าง OS แล้ว"); qc.invalidateQueries({ queryKey: ["os-templates"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateOs() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { os_name?: string; os_version?: string; vmid?: number } }) =>
      PackageService.updateOs(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดต OS แล้ว"); qc.invalidateQueries({ queryKey: ["os-templates"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// VM Specs
export function useCreateVm() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { core: number; memory: string; size: string }) =>
      PackageService.createVm(data, accessToken!),
    onSuccess: () => { toast.success("สร้าง VM Spec แล้ว"); qc.invalidateQueries({ queryKey: ["vm-specs"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateVm() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { core?: number; memory?: string; size?: string } }) =>
      PackageService.updateVm(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดต VM Spec แล้ว"); qc.invalidateQueries({ queryKey: ["vm-specs"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// IP Pools
export function useAdminIpPools() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-ip-pools"],
    queryFn: () => IpPoolService.list(accessToken!),
    enabled: !!accessToken,
  })
}

export function useCreateIpPool() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { ip: string; type: IpType }) => IpPoolService.create(data, accessToken!),
    onSuccess: () => { toast.success("เพิ่ม IP แล้ว"); qc.invalidateQueries({ queryKey: ["admin-ip-pools"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCreateIpRange() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { ip_start: string; ip_end: string; type: IpType }) =>
      IpPoolService.createRange(data, accessToken!),
    onSuccess: (result) => {
      toast.success(`เพิ่ม ${result.added} IP แล้ว${result.skipped ? ` (ข้าม ${result.skipped})` : ""}`)
      qc.invalidateQueries({ queryKey: ["admin-ip-pools"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateIpPool() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { ip?: string; type?: IpType } }) =>
      IpPoolService.update(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดต IP แล้ว"); qc.invalidateQueries({ queryKey: ["admin-ip-pools"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useToggleIpPool() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => IpPoolService.toggleStatus(id, accessToken!),
    onSuccess: () => { toast.success("อัปเดตสถานะแล้ว"); qc.invalidateQueries({ queryKey: ["admin-ip-pools"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// VPS Queue (Admin/Support)
export function useVpsQueue() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vps-queue"],
    queryFn: () => VpsService.getQueue(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 15000,
  })
}

export function useProvisionVps() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) => VpsService.provision(orderId, accessToken!),
    onSuccess: () => { toast.success("เริ่ม Provision แล้ว"); qc.invalidateQueries({ queryKey: ["vps-queue"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Audit Logs
export function useAuditLogs(filters: AuditLogFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-audit-logs", filters],
    queryFn: () => AuditLogService.list(filters, accessToken!),
    enabled: !!accessToken,
  })
}

// Email Templates
export function useEmailTemplates() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: () => EmailTemplateService.list(accessToken!),
    enabled: !!accessToken,
  })
}

export function useUpdateEmailTemplate() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, data }: { type: EmailTemplateType; data: UpdateEmailTemplateInput }) =>
      EmailTemplateService.update(type, data, accessToken!),
    onSuccess: () => { toast.success("บันทึก template แล้ว"); qc.invalidateQueries({ queryKey: ["email-templates"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useToggleEmailTemplate() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, is_active }: { type: EmailTemplateType; is_active: boolean }) =>
      EmailTemplateService.toggleActive(type, is_active, accessToken!),
    onSuccess: () => { toast.success("อัปเดตสถานะแล้ว"); qc.invalidateQueries({ queryKey: ["email-templates"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// VPS detail + upgrade (admin)
export function useAdminVpsDetail(id: number, options?: { fastPoll?: boolean }) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-vps-detail", id],
    queryFn: () => VpsService.getById(id, accessToken!),
    enabled: !!accessToken && !!id,
    refetchInterval: options?.fastPoll ? 3000 : 15000,
  })
}

// Auto-approved upgrades (free/prorated to 0) apply immediately. Paid upgrades create a
// PENDING order instead — nothing changes on the VPS until the owning user pays for it.
function handleAdminUpgradeResult(r: UpgradeResult, qc: ReturnType<typeof useQueryClient>, vpsId: number) {
  qc.invalidateQueries({ queryKey: ["admin-vps-detail", vpsId] })
  qc.invalidateQueries({ queryKey: ["support-vps-all"] })
  qc.invalidateQueries({ queryKey: ["admin-orders"] })
  if (r.auto_approved) {
    toast.success("อัปเกรดสำเร็จ")
  } else {
    toast.success(`สร้างคำสั่งอัปเกรดแล้ว (Order #${r.order.ref_no}) ยอด ${r.amount_charged.toLocaleString()} บาท — รอผู้ใช้ชำระเงิน`)
  }
}

export function useAdminUpgradePackage(vpsId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpgradePackageInput) => UpgradeService.upgradePackage(vpsId, data, accessToken!),
    onSuccess: (r) => handleAdminUpgradeResult(r, qc, vpsId),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAdminUpgradeCustom(vpsId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpgradeCustomInput) => UpgradeService.upgradeCustom(vpsId, data, accessToken!),
    onSuccess: (r) => handleAdminUpgradeResult(r, qc, vpsId),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAdminUpgradeHistory(vpsId: number) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["admin-upgrade-history", vpsId],
    queryFn: () => UpgradeService.getHistory(vpsId, accessToken!),
    enabled: !!accessToken && !!vpsId,
  })
}

// VPS password change (Admin — any VPS)
export function useAdminVpsPasswordChange(id: number) {
  const { accessToken } = useAuth()

  const requestOtp = useMutation({
    mutationFn: () => VpsService.requestPasswordChange(id, accessToken!),
  })

  const confirm = useMutation({
    mutationFn: (data: ConfirmVpsPasswordChangeInput) => VpsService.confirmPasswordChange(id, data, accessToken!),
  })

  return { requestOtp, confirm }
}

// System capacity (Proxmox node snapshot)
export function useSystemCapacity() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["system-capacity"],
    queryFn: () => SystemService.getCapacity(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 30_000,
  })
}
