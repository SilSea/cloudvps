"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw, Maximize2, Minimize2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { TerminalService } from "@/services/api/terminal"
import { cn } from "@/lib/utils"

interface Props {
  vpsId: number
  vpsName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const WS_CLOSE_MESSAGES: Record<number, string> = {
  4001: "Token หมดอายุหรือไม่ถูกต้อง กรุณาเปิด terminal ใหม่",
  4003: "Token ไม่ตรงกับ VPS กรุณาลองใหม่",
  1011: "Backend ไม่สามารถเชื่อมต่อ Proxmox",
}

// Browser intercepts these before noVNC's canvas sees them (navigates back, scrolls the
// page, moves focus, etc). preventDefault in the capture phase so the VM receives them instead.
const BROWSER_INTERCEPTED_KEYS = new Set([
  "Delete", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
])

// Combos the browser/OS intercept before they ever reach the noVNC canvas as real keyboard
// events (Ctrl+Alt+Del, Win key, Alt+Tab, ...) — synthesized directly into the VNC session
// instead via rfb.sendKey(). Backend `docs/frontend.md` §10i — frontend-only, WS proxy is a
// raw byte passthrough.
const KEYSYM = {
  CTRL_L: 0xffe3, ALT_L: 0xffe9, SUPER_L: 0xffeb,
  DELETE: 0xffff, ESCAPE: 0xff1b, TAB: 0xff09, F4: 0xffc1, PRINT: 0xff61,
}

// noVNC's RFB instance has no published TypeScript type (see rfbRef below) — one disable
// covers this whole file instead of one per callback.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NoVncRfb = any

function sendCombo(rfb: NoVncRfb, keysyms: number[]) {
  if (!rfb) return
  keysyms.forEach((k) => rfb.sendKey(k, null, true))
  ;[...keysyms].reverse().forEach((k) => rfb.sendKey(k, null, false))
}

const SPECIAL_KEYS: { label: string; action: (rfb: NoVncRfb) => void }[] = [
  { label: "Ctrl+Alt+Del", action: (rfb) => rfb?.sendCtrlAltDel() },
  { label: "⊞ Win", action: (rfb) => sendCombo(rfb, [KEYSYM.SUPER_L]) },
  { label: "Alt+Tab", action: (rfb) => sendCombo(rfb, [KEYSYM.ALT_L, KEYSYM.TAB]) },
  { label: "Alt+F4", action: (rfb) => sendCombo(rfb, [KEYSYM.ALT_L, KEYSYM.F4]) },
  { label: "Ctrl+Esc", action: (rfb) => sendCombo(rfb, [KEYSYM.CTRL_L, KEYSYM.ESCAPE]) },
  { label: "Esc", action: (rfb) => sendCombo(rfb, [KEYSYM.ESCAPE]) },
  { label: "PrtScn", action: (rfb) => sendCombo(rfb, [KEYSYM.PRINT]) },
]

type ConnState = "connecting" | "connected" | "error"

export function VpsTerminalModal({ vpsId, vpsName, open, onOpenChange }: Props) {
  const [retryKey, setRetryKey] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-4xl", isFullscreen && "sm:max-w-[98vw] w-[98vw]")}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle>Console: {vpsName}</DialogTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setIsFullscreen((v) => !v)}
              title={isFullscreen ? "ย่อหน้าต่าง" : "ขยายเต็มจอ"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </DialogHeader>
        <p className="text-[11px] text-accent-yellow -mt-2">⚠ Numpad ไม่สามารถใช้งานได้ในหน้าจอนี้ กรุณาใช้แป้นตัวเลขแถวบนแทน</p>
        <div className={cn("relative bg-black rounded-[6px] overflow-hidden", isFullscreen ? "h-[85vh]" : "h-[70vh]")}>
          {open && (
            <TerminalSession
              key={retryKey}
              vpsId={vpsId}
              onRetry={() => setRetryKey((k) => k + 1)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TerminalSession({ vpsId, onRetry }: { vpsId: number; onRetry: () => void }) {
  const { accessToken } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<NoVncRfb>(null)
  const [state, setState] = useState<ConnState>("connecting")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function connect() {
      if (!accessToken || !containerRef.current) return
      try {
        const { token, vnc_password } = await TerminalService.getToken(vpsId, accessToken)
        if (cancelled) return

        const base = process.env.NEXT_PUBLIC_API_URL ?? ""
        const apiUrl = new URL(base)
        const wsProtocol = apiUrl.protocol === "https:" ? "wss" : "ws"
        const wsUrl = `${wsProtocol}://${apiUrl.host}/api/terminal/${vpsId}?token=${token}`

        const { default: RFB } = await import("@novnc/novnc")
        if (cancelled || !containerRef.current) return

        const rfb = new RFB(containerRef.current, wsUrl)
        // QEMU's VNC display doesn't support server-side desktop resize (it logs
        // "administratively prohibited" and no-ops) — scaleViewport alone handles fit-to-window.
        rfb.scaleViewport = true
        rfb.focusOnClick = true
        rfbRef.current = rfb

        rfb.addEventListener("connect", () => {
          if (!cancelled) setState("connected")
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rfb.addEventListener("disconnect", (e: any) => {
          // RFB already tore itself down — drop the ref so cleanup doesn't call
          // disconnect() again on a dead object (novnc logs a console error for that).
          rfbRef.current = null
          if (cancelled) return
          const code = e.detail?.clean === false ? e.detail?.code : undefined
          setState("error")
          setErrorMsg(WS_CLOSE_MESSAGES[code] ?? "Terminal ถูกปิด")
        })
        rfb.addEventListener("credentialsrequired", () => {
          rfb.sendCredentials({ password: vnc_password })
        })
      } catch {
        if (!cancelled) {
          setState("error")
          setErrorMsg("ไม่สามารถเปิด terminal ได้")
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      try { rfbRef.current?.disconnect() } catch {}
      rfbRef.current = null
    }
  }, [vpsId, accessToken])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (BROWSER_INTERCEPTED_KEYS.has(e.key)) e.preventDefault()
    }
    // Capture phase — intercept before the browser's own handling (back-navigation, scroll, tab-out).
    el.addEventListener("keydown", onKeyDown, true)
    return () => el.removeEventListener("keydown", onKeyDown, true)
  }, [])

  return (
    <div className="flex h-full w-full flex-col">
      {state === "connected" && (
        // In normal document flow (not absolute) so it takes real space instead of
        // covering the top of the guest screen — e.g. Windows Server's taskbar/Start
        // button, which sits exactly where an overlaid toolbar used to sit.
        <div className="shrink-0 flex flex-wrap gap-1 p-1.5 bg-black/60">
          {SPECIAL_KEYS.map((k) => (
            <Button
              key={k.label}
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px] rounded-[4px] bg-black/40 border-white/20 text-white hover:bg-white/10 hover:text-white"
              onClick={() => k.action(rfbRef.current)}
            >
              {k.label}
            </Button>
          ))}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {state === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังเชื่อมต่อ...
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-sm text-secondary">
            <p>{errorMsg}</p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-[9999px]"
              onClick={onRetry}
            >
              <RefreshCw className="h-3.5 w-3.5" /> เชื่อมต่อใหม่
            </Button>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  )
}
