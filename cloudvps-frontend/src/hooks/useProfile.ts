"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { UserService } from "@/services/api/users"
import { UpgradeService } from "@/services/api/upgrade"
import { SystemConfigService } from "@/services/api/system-configs"
import { useAuth } from "./useAuth"
import type { UpdateProfileInput, ChangePasswordInput } from "@/types/user"
import type { UpgradePackageInput, UpgradeCustomInput, UpgradeResult } from "@/services/api/upgrade"

// Unit pricing for the custom-upgrade cost preview — any authenticated role can read this
// (GET /api/system-configs/pricing, non-secret). Values don't change often; default 30s
// staleTime from the global QueryClient is plenty.
export function usePricing() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["upgrade-pricing"],
    queryFn: () => SystemConfigService.getPricing(accessToken!),
    enabled: !!accessToken,
  })
}

export function useProfile() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => UserService.getMe(accessToken!),
    enabled: !!accessToken,
  })
}

export function useUpdateProfile() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateProfileInput) => UserService.updateMe(data, accessToken!),
    onSuccess: () => { toast.success("บันทึกข้อมูลแล้ว"); qc.invalidateQueries({ queryKey: ["profile"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useChangePassword() {
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: (data: ChangePasswordInput) => UserService.changePassword(data, accessToken!),
    onSuccess: () => toast.success("เปลี่ยนรหัสผ่านแล้ว"),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useChangeEmail() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => UserService.changeEmail(email, accessToken!),
    onSuccess: () => { toast.success("เปลี่ยนอีเมลแล้ว กรุณาตรวจสอบอีเมลใหม่"); qc.invalidateQueries({ queryKey: ["profile"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpgradeHistory(vpsId: number) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["upgrade-history", vpsId],
    queryFn: () => UpgradeService.getHistory(vpsId, accessToken!),
    enabled: !!accessToken && !!vpsId,
  })
}

// Auto-approved upgrades (free/prorated to 0) apply immediately. Paid upgrades create a
// PENDING order instead — nothing changes on the VPS until it's paid, so send the user
// straight to checkout rather than leaving them on a page where nothing visibly happened.
function handleUpgradeResult(r: UpgradeResult, router: ReturnType<typeof useRouter>, qc: ReturnType<typeof useQueryClient>, vpsId: number) {
  qc.invalidateQueries({ queryKey: ["vps", vpsId] })
  qc.invalidateQueries({ queryKey: ["orders"] })
  if (r.auto_approved) {
    toast.success("อัปเกรดสำเร็จ")
  } else {
    toast.success(`สร้างคำสั่งอัปเกรดแล้ว ยอดชำระ ${r.amount_charged.toLocaleString()} บาท กรุณาชำระเงินเพื่อดำเนินการต่อ`)
    router.push(`/billing/orders/${r.order.id}`)
  }
}

export function useUpgradePackage(vpsId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpgradePackageInput) => UpgradeService.upgradePackage(vpsId, data, accessToken!),
    onSuccess: (r) => handleUpgradeResult(r, router, qc, vpsId),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpgradeCustom(vpsId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (data: UpgradeCustomInput) => UpgradeService.upgradeCustom(vpsId, data, accessToken!),
    onSuccess: (r) => handleUpgradeResult(r, router, qc, vpsId),
    onError: (e: Error) => toast.error(e.message),
  })
}
