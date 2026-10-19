// Role names mirror the values stored in the `roles` table.
// "users" is the default role assigned at registration.
export type RoleName = "admin" | "support" | "users";

// Claims embedded inside every JWT. `sub` is the numeric primary key of `users`.
export interface JwtPayload {
  sub: number;      // users.id
  email: string;
  role: RoleName;
  type: "access" | "refresh" | "email_verify";
  iat?: number;
  exp?: number;
}

// Short-lived (30s) token issued for noVNC WebSocket handshake.
// Never exposed to the browser — verified server-side during WS upgrade.
export interface TerminalTokenPayload {
  type: "terminal";
  sub: number;      // users.id (owner)
  vpsId: number;
  vmid: number;
  ticket: string;   // Proxmox vncproxy ticket
  port: number;     // Proxmox VNC port
  iat?: number;
  exp?: number;
}

// Derived from the verified JWT and injected into the request context
// by the auth middleware. Used by RBAC guards and controllers.
export interface AuthUser {
  id: number;
  email: string;
  role: RoleName;
  status: boolean;
  is_verify: boolean;
}
