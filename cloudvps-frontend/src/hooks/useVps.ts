"use client"

import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { VpsService } from "@/services/api/vps"
import { NatService } from "@/services/api/nat"
import { useAuth } from "./useAuth"
import type { AutoRenewInput, ConfirmVpsPasswordChangeInput } from "@/types/vps"
import type { AddPortRuleInput } from "@/types/nat"

export function useVpsList(page = 1, limit = 20) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vps", page, limit],
    queryFn: () => VpsService.list(accessToken!, page, limit),
    enabled: !!accessToken,
  })
}

export function useVps(id: number, options?: { fastPoll?: boolean }) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vps", id],
    queryFn: () => VpsService.getById(id, accessToken!),
    enabled: !!accessToken && !!id,
    // poll while status false (could be provisioning/stopped — no string enum), or fast while rebooting
    refetchInterval: (query) => (options?.fastPoll ? 3000 : !query.state.data ? 5000 : false),
  })
}

const REBOOT_MIN_MS = 8_000
const REBOOT_MAX_MS = 90_000

// Reboot flips DB/live status through a stopped phase mid-flight — show a dedicated
// "rebooting" state instead of flashing "Stopped", until the VM is confirmed back up.
//
// `checkRunning` is a plain function meant to be called from the render body (not an
// effect) once the caller has its own `isRunning` value — React's "adjust state while
// rendering" pattern. This also sidesteps a hook-ordering problem: callers need `rebooting`
// to configure fast-polling on the `useVps`/`useAdminVpsDetail` query itself, which happens
// before `isRunning` can be derived from that same query's data.
export function useRebootIndicator() {
  const [rebooting, setRebooting] = useState(false)
  const startedAtRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startReboot = () => {
    startedAtRef.current = Date.now()
    setRebooting(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    // Safety net — clear even if we never observe a fresh "running" poll.
    timeoutRef.current = setTimeout(() => setRebooting(false), REBOOT_MAX_MS)
  }

  // Early clear once the VM is confirmed back up, past the debounce window so we don't
  // clear on the stale "running" snapshot from right before the reboot was issued.
  const checkRunning = (isRunning: boolean | "unknown") => {
    if (!rebooting || isRunning !== true) return
    if (Date.now() - startedAtRef.current < REBOOT_MIN_MS) return
    setRebooting(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  return { rebooting, startReboot, checkRunning }
}

export function useVpsActions(id: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()

  const invalidate = () => qc.invalidateQueries({ queryKey: ["vps", id] })

  const start = useMutation({
    mutationFn: () => VpsService.start(id, accessToken!),
    onSuccess: () => { toast.success("เริ่มต้น VPS แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const stop = useMutation({
    mutationFn: () => VpsService.stop(id, accessToken!),
    onSuccess: () => { toast.success("หยุด VPS แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const reboot = useMutation({
    mutationFn: () => VpsService.reboot(id, accessToken!),
    onSuccess: () => { toast.success("Reboot VPS แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const forceReset = useMutation({
    mutationFn: () => VpsService.forceReset(id, accessToken!),
    onSuccess: () => { toast.success("Reset สำเร็จ"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleAutoRenew = useMutation({
    mutationFn: (data: AutoRenewInput) => VpsService.toggleAutoRenew(id, data, accessToken!),
    onSuccess: () => { toast.success("อัพเดต auto-renew แล้ว"); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })

  return { start, stop, reboot, forceReset, toggleAutoRenew }
}

export function useVpsPasswordChange(id: number) {
  const { accessToken } = useAuth()

  const requestOtp = useMutation({
    mutationFn: () => VpsService.requestPasswordChange(id, accessToken!),
  })

  const confirm = useMutation({
    mutationFn: (data: ConfirmVpsPasswordChangeInput) => VpsService.confirmPasswordChange(id, data, accessToken!),
  })

  return { requestOtp, confirm }
}

export function useVpsStatus(id: number) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vps-status", id],
    queryFn: () => VpsService.getStatus(id, accessToken!),
    enabled: !!accessToken && !!id,
    refetchInterval: 10_000,
    retry: false,
  })
}

export function usePortRules(vpsId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ["port-rules", vpsId],
    queryFn: () => NatService.getPortRules(vpsId, accessToken!),
    enabled: !!accessToken && !!vpsId,
  })

  const add = useMutation({
    mutationFn: (data: AddPortRuleInput) => NatService.addPortRule(vpsId, data, accessToken!),
    onSuccess: () => {
      toast.success("เพิ่ม port rule แล้ว")
      qc.invalidateQueries({ queryKey: ["port-rules", vpsId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (ruleId: number) => NatService.deletePortRule(vpsId, ruleId, accessToken!),
    onSuccess: () => {
      toast.success("ลบ port rule แล้ว")
      qc.invalidateQueries({ queryKey: ["port-rules", vpsId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return { ...query, add, remove }
}
