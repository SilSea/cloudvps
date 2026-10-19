import Elysia, { t } from "elysia";
import { terminalController } from "../controllers/terminal.controller";
import { terminalService } from "../services/terminal.service";
import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";
import { systemConfigService } from "../services/system-config.service";
import { env } from "../config/env";
import { logger } from "../utils/logger";

// Convert proxmox host config to bare "host:port" for WS URLs.
// Handles: "10.0.0.1", "10.0.0.1:8006", "https://10.0.0.1:8006"
function toWsHost(host: string): string {
  if (host.startsWith("http://") || host.startsWith("https://")) {
    const u = new URL(host);
    return u.host; // already includes port if set
  }
  return host.includes(":") ? host : `${host}:8006`;
}

export const terminalRoutes = new Elysia({ prefix: "/terminal" })
  // ── REST: GET /api/terminal/:vps_id/token (USER own / ADMIN any) ────────────
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      .guard({ beforeHandle: requireRoles("admin", "users") as any }, (inner) =>
        inner.get("/:vps_id/token", terminalController.getToken, {
          params: t.Object({ vps_id: t.String() }),
          detail: {
            summary: "Get 30-second terminal token for noVNC WebSocket",
            tags: ["Terminal"],
          },
        })
      )
  )

  // ── WebSocket: WS /api/terminal/:vps_id?token=xxx ────────────────────────────
  // Auth is done inside open() via the short-lived terminal JWT — no cookie/bearer needed.
  .ws("/:vps_id", {
    query: t.Object({ token: t.String() }),

    async open(ws) {
      const { token } = ws.data.query;

      // Verify terminal JWT (throws if invalid or expired)
      let payload: Awaited<ReturnType<typeof terminalService.verifyToken>>;
      try {
        payload = await terminalService.verifyToken(token);
      } catch {
        ws.close(4001, "Invalid or expired token");
        return;
      }

      // Ensure vpsId in URL matches token
      const urlVpsId = parseInt((ws.data as any).params?.vps_id ?? "0", 10);
      if (urlVpsId !== payload.vpsId) {
        ws.close(4003, "Token/VPS mismatch");
        return;
      }

      // Fetch Proxmox connection config
      const [cfgHost, cfgNode, cfgTokenId, cfgTokenSecret] = await Promise.all([
        systemConfigService.get("proxmox.host"),
        systemConfigService.get("proxmox.node"),
        systemConfigService.get("proxmox.token_id"),
        systemConfigService.get("proxmox.token_secret"),
      ]);
      const h = cfgHost || env.proxmox.host;
      const n = cfgNode || env.proxmox.node;
      const ti = cfgTokenId || env.proxmox.tokenId;
      const ts = cfgTokenSecret || env.proxmox.tokenSecret;

      const vncUrl =
        `wss://${toWsHost(h)}/api2/json/nodes/${n}/qemu/${payload.vmid}/vncwebsocket` +
        `?port=${payload.port}&vncticket=${encodeURIComponent(payload.ticket)}`;

      try {
        // Bun extends WebSocket constructor to accept options as second arg (headers, tls).
        // Cast to any because the W3C typings only declare (url, protocols?).
        const proxmoxWs = new WebSocket(vncUrl, {
          headers: { Authorization: `PVEAPIToken=${ti}=${ts}` },
          tls: { rejectUnauthorized: false },
          protocols: ["binary"],
        } as any);

        (ws.data as any).__proxmoxWs = proxmoxWs;

        proxmoxWs.onmessage = (event: MessageEvent) => {
          ws.send(event.data);
        };
        proxmoxWs.onclose = () => {
          ws.close();
        };
        proxmoxWs.onerror = () => {
          logger.vps("terminal_proxmox_ws_error", { vpsId: payload.vpsId, vmid: payload.vmid });
          ws.close(1011, "Proxmox connection error");
        };

        logger.vps("terminal_ws_opened", { vpsId: payload.vpsId, vmid: payload.vmid, userId: payload.sub });
      } catch (e: any) {
        logger.vps("terminal_ws_connect_failed", { vpsId: payload.vpsId, error: e.message });
        ws.close(1011, "Failed to connect to Proxmox");
      }
    },

    message(ws, data) {
      const proxmoxWs = (ws.data as any).__proxmoxWs as WebSocket | undefined;
      if (proxmoxWs && proxmoxWs.readyState === WebSocket.OPEN) {
        proxmoxWs.send(data as any);
      }
    },

    close(ws) {
      const proxmoxWs = (ws.data as any).__proxmoxWs as WebSocket | undefined;
      try { proxmoxWs?.close(); } catch {}
      logger.vps("terminal_ws_closed", { vpsId: (ws.data as any).params?.vps_id });
    },
  });
