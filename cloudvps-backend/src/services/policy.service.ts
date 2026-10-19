import { prisma } from "../config/database";
import { logger } from "../utils/logger";

export const policyService = {
  async getActive() {
    return prisma.policies.findMany({
      where: { status: true },
      select: { id: true, policie_title: true, policies_type: true, version: true, policies_detail: true },
      orderBy: [{ policies_type: "asc" }, { created_at: "desc" }],
    });
  },

  async getAll() {
    return prisma.policies.findMany({
      orderBy: [{ policies_type: "asc" }, { version: "desc" }],
    });
  },

  async getById(id: number) {
    return prisma.policies.findUnique({ where: { id } });
  },

  async create(data: {
    policie_title: string;
    policies_detail: string;
    policies_type: "PDPA" | "TERMSERVICE";
    version: string;
  }) {
    return prisma.policies.create({ data: { ...data, status: true } });
  },

  async update(id: number, data: { policie_title?: string; policies_detail?: string; version?: string }) {
    const policy = await prisma.policies.findUnique({ where: { id } });
    if (!policy) return null;
    return prisma.policies.update({ where: { id }, data });
  },

  async toggleStatus(id: number) {
    const policy = await prisma.policies.findUnique({ where: { id }, select: { status: true } });
    if (!policy) return null;
    return prisma.policies.update({ where: { id }, data: { status: !policy.status } });
  },

  // Returns active policy IDs that the user has NOT yet accepted.
  async getPendingPolicyIds(userId: number): Promise<number[]> {
    const active = await prisma.policies.findMany({ where: { status: true }, select: { id: true } });
    if (active.length === 0) return [];
    const accepted = await prisma.consents.findMany({
      where: { users_id: userId, policies_id: { in: active.map((p) => p.id) } },
      select: { policies_id: true },
    });
    const acceptedIds = new Set(accepted.map((c) => c.policies_id));
    return active.map((p) => p.id).filter((id) => !acceptedIds.has(id));
  },

  async addConsent(userId: number, policyId: number) {
    const policy = await prisma.policies.findUnique({ where: { id: policyId }, select: { id: true, status: true } });
    if (!policy) return { error: "Policy not found" };
    if (!policy.status) return { error: "Policy is not active" };

    const existing = await prisma.consents.findFirst({ where: { users_id: userId, policies_id: policyId } });
    if (existing) return { data: existing, already_accepted: true as const };

    const consent = await prisma.consents.create({ data: { users_id: userId, policies_id: policyId } });
    logger.auth("consent_accepted", { userId, policyId });
    return { data: consent };
  },

  async getMyConsents(userId: number) {
    return prisma.consents.findMany({
      where: { users_id: userId },
      include: {
        policy: { select: { policie_title: true, policies_type: true, version: true } },
      },
      orderBy: { accepted_at: "desc" },
    });
  },
};
