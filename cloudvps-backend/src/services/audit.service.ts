import { prisma } from "../config/database";
import { logger } from "../utils/logger";

type AuditAction =
  | "CREATE" | "UPDATE" | "ENABLE" | "DISABLE"
  | "APPROVE" | "REJECT" | "CANCEL"
  | "START" | "STOP" | "REBOOT" | "RESET" | "VIEW" | "EXPIRE" | "ROLE_CHANGE"
  | "BROADCAST" | "UPGRADE" | "ASSIGN" | "REPLY" | "BYPASS";

type AuditEntity =
  | "USER" | "VPS" | "ORDER" | "TRANSACTION"
  | "PACKAGE" | "OS_TEMPLATE" | "VM_SPEC"
  | "PROMOTION" | "POLICY" | "IP_POOL" | "SYSTEM_CONFIG"
  | "EMAIL_BROADCAST" | "VPS_UPGRADE" | "PACKAGE_CATEGORY" | "EMAIL_TEMPLATE"
  | "TICKET" | "TICKET_CATEGORY" | "CAPACITY_CHECK" | "VPS_TERMINAL";

export interface AuditEntry {
  actorId: number;
  actorRole: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: number;
  targetUserId?: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export const auditService = {
  // Fire-and-forget — never throws, never blocks the main request.
  record(entry: AuditEntry): void {
    prisma.admin_audit_logs
      .create({
        data: {
          actor_id: entry.actorId,
          actor_role: entry.actorRole,
          action: entry.action as any,
          entity: entry.entity as any,
          entity_id: entry.entityId,
          target_user_id: entry.targetUserId,
          metadata: entry.metadata as any,
          ip_address: entry.ipAddress,
        },
      })
      .catch((e: any) => logger.error("audit_log_write_failed", { error: e.message, entry }));
  },
};
