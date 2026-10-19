import { upgradeService } from "../services/upgrade.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

const ERROR_MAP: Record<string, { status: number; message: string }> = {
  VPS_NOT_FOUND:              { status: 404, message: "VPS not found." },
  FORBIDDEN:                  { status: 403, message: "Access denied." },
  UPGRADE_PENDING:            { status: 409, message: "An upgrade order is already pending for this VPS." },
  PACKAGE_NOT_FOUND:          { status: 404, message: "Package not found." },
  PACKAGE_INACTIVE:           { status: 400, message: "Package is inactive." },
  OS_MISMATCH:                { status: 400, message: "New package has a different OS than the current VPS." },
  NO_CHANGE:                  { status: 400, message: "No change in specs detected." },
  DISK_SHRINK_NOT_ALLOWED:    { status: 400, message: "Disk size cannot be reduced." },
  CONFIG_MISSING:             { status: 500, message: "Pricing configuration is missing. Contact admin." },
};

export const upgradeController = {
  async createPackageUpgrade({ user, params, body, set, request }: any) {
    const vpsId = parseInt(params.id, 10);
    if (isNaN(vpsId)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const packageId = parseInt(body?.package_id, 10);
    if (isNaN(packageId)) { set.status = 400; return { success: false, message: "package_id is required." }; }

    const result = await upgradeService.createPackageUpgrade({
      vpsId,
      newPackageId: packageId,
      requestedByUserId: user.id,
      requestedByRole: user.role,
      ipAddress: getIp(request),
    });

    if (result.error) {
      const mapped = ERROR_MAP[result.error] ?? { status: 400, message: result.error };
      set.status = mapped.status;
      return { success: false, message: mapped.message };
    }
    set.status = 201;
    return { success: true, data: result.data };
  },

  async createCustomUpgrade({ user, params, body, set, request }: any) {
    const vpsId = parseInt(params.id, 10);
    if (isNaN(vpsId)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const newCores   = body?.cores      != null ? parseInt(body.cores, 10)       : undefined;
    const newMemGib  = body?.memory_gib != null ? parseInt(body.memory_gib, 10)  : undefined;
    const newDiskGb  = body?.disk_gb    != null ? parseInt(body.disk_gb, 10)     : undefined;

    if (newCores === undefined && newMemGib === undefined && newDiskGb === undefined) {
      set.status = 400;
      return { success: false, message: "At least one of cores, memory_gib, disk_gb must be provided." };
    }

    const result = await upgradeService.createCustomUpgrade({
      vpsId,
      newCores,
      newMemoryGib: newMemGib,
      newDiskGb,
      requestedByUserId: user.id,
      requestedByRole: user.role,
      ipAddress: getIp(request),
    });

    if (result.error) {
      const mapped = ERROR_MAP[result.error] ?? { status: 400, message: result.error };
      set.status = mapped.status;
      return { success: false, message: mapped.message };
    }
    set.status = 201;
    return { success: true, data: result.data };
  },

  async getHistory({ user, params, query, set }: any) {
    const vpsId = parseInt(params.id, 10);
    if (isNaN(vpsId)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const page  = Math.max(1, parseInt(query?.page  ?? "1",  10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "20", 10)));

    const result = await upgradeService.getUpgradeHistory(vpsId, user.id, user.role, page, limit);
    if (result.error === "VPS_NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN")     { set.status = 403; return { success: false, message: "Access denied." }; }
    return { success: true, data: result.data };
  },
};
