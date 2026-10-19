"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UserService } from "@/services/api/users"
import type { UpdateProfileInput } from "@/types/user"
import { VpsService } from "@/services/api/vps"
import { OrderService } from "@/services/api/orders"
import { TransactionService } from "@/services/api/transactions"
import { UpgradeService } from "@/services/api/upgrade"
import type { UpgradePackageInput, UpgradeCustomInput, UpgradeResult } from "@/services/api/upgrade"
import { useAuth } from "./useAuth"

export function useSupportUsers() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["support-users"],
    queryFn: () => UserService.listAll(accessToken!),
    enabled: !!accessToken,
  })
}

export function useSupportUpdateUser() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProfileInput }) =>
      UserService.updateUser(id, data, accessToken!),
    onSuccess: () => { toast.success("อัปเดตข้อมูลแล้ว"); qc.invalidateQueries({ queryKey: ["support-users"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSupportToggleActive() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => UserService.toggleActive(id, accessToken!),
    onSuccess: () => { toast.success("อัปเดตสถานะแล้ว"); qc.invalidateQueries({ queryKey: ["support-users"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSupportAllVps() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["support-vps-all"],
    queryFn: () => VpsService.list(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 30000,
  })
}

export function useSupportVpsActions() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()

  const invalidate = () => qc.invalidateQueries({ queryKey: ["support-vps-all"] })

  const startVps = useMutation({
    mutationFn: (id: number) => VpsService.start(id, accessToken!),
    onSuccess: () => { toast.success("เริ่มต้น VPS แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const stopVps = useMutation({
    mutationFn: (id: number) => VpsService.stop(id, accessToken!),
    onSuccess: () => { toast.success("หยุด VPS แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const rebootVps = useMutation({
    mutationFn: (id: number) => VpsService.reboot(id, accessToken!),
    onSuccess: () => { toast.success("รีบูต VPS แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const forceDelete = useMutation({
    mutationFn: (id: number) => VpsService.forceDelete(id, accessToken!),
    onSuccess: () => { toast.success("ลบ VPS แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const forceReset = useMutation({
    mutationFn: (id: number) => VpsService.forceReset(id, accessToken!),
    onSuccess: () => { toast.success("Reset สำเร็จ"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  return { startVps, stopVps, rebootVps, forceDelete, forceReset }
}

export function useSupportVpsStatus(id: number) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["support-vps-status", id],
    queryFn: () => VpsService.getStatus(id, accessToken!),
    enabled: !!accessToken && !!id,
    refetchInterval: 10_000,
    retry: false,
  })
}

// VPS detail + upgrade (support)
export function useSupportVpsDetail(id: number, options?: { fastPoll?: boolean }) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["support-vps-detail", id],
    queryFn: () => VpsService.getById(id, accessToken!),
    enabled: !!accessToken && !!id,
    refetchInterval: options?.fastPoll ? 3000 : 15000,
  })
}

// Auto-approved upgrades (free/prorated to 0) apply immediately. Paid upgrades create a
// PENDING order instead — nothing changes on the VPS until the owning user pays for it.
function handleSupportUpgradeResult(r: UpgradeResult, qc: ReturnType<typeof useQueryClient>, vpsId: number) {
  qc.invalidateQueries({ queryKey: ["support-vps-detail", vpsId] })
  qc.invalidateQueries({ queryKey: ["support-vps-all"] })
  qc.invalidateQueries({ queryKey: ["support-orders"] })
  if (r.auto_approved) {
    toast.success("อัปเกรดสำเร็จ")
  } else {
    toast.success(`สร้างคำสั่งอัปเกรดแล้ว (Order #${r.order.ref_no}) ยอด ${r.amount_charged.toLocaleString()} บาท — รอผู้ใช้ชำระเงิน`)
  }
}

export function useSupportUpgradePackage(vpsId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpgradePackageInput) => UpgradeService.upgradePackage(vpsId, data, accessToken!),
    onSuccess: (r) => handleSupportUpgradeResult(r, qc, vpsId),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSupportUpgradeCustom(vpsId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpgradeCustomInput) => UpgradeService.upgradeCustom(vpsId, data, accessToken!),
    onSuccess: (r) => handleSupportUpgradeResult(r, qc, vpsId),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSupportUpgradeHistory(vpsId: number) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["support-upgrade-history", vpsId],
    queryFn: () => UpgradeService.getHistory(vpsId, accessToken!),
    enabled: !!accessToken && !!vpsId,
  })
}

// Orders
export function useSupportOrders() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["support-orders"],
    queryFn: () => OrderService.list(accessToken!),
    enabled: !!accessToken,
  })
}

// Transactions
export function useSupportTransactions() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["support-transactions"],
    queryFn: () => TransactionService.list(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 10000,
  })
}

export function useSupportApproveTransaction() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => TransactionService.approve(id, accessToken!),
    onSuccess: () => { toast.success("อนุมัติแล้ว"); qc.invalidateQueries({ queryKey: ["support-transactions"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSupportRejectTransaction() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => TransactionService.reject(id, accessToken!),
    onSuccess: () => { toast.success("ปฏิเสธแล้ว"); qc.invalidateQueries({ queryKey: ["support-transactions"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}
