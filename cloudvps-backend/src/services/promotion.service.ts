import { prisma } from "../config/database";

export const promotionService = {
  async list() {
    return prisma.promotions.findMany({ orderBy: { created_at: "desc" } });
  },

  async create(data: {
    code_name: string;
    description: string;
    type: "DISCOUNT" | "PERCENT";
    discount: number;
    expired_at?: string;
    max_uses?: number | null;
    max_uses_per_user?: number | null;
  }) {
    const exists = await prisma.promotions.findUnique({ where: { code_name: data.code_name } });
    if (exists) return { error: "Promotion code already exists" };

    const promo = await prisma.promotions.create({
      data: {
        code_name: data.code_name,
        description: data.description,
        type: data.type,
        discount: data.discount,
        status: true,
        expired_at: data.expired_at ? new Date(data.expired_at) : null,
        max_uses: data.max_uses ?? null,
        max_uses_per_user: data.max_uses_per_user ?? null,
      },
    });
    return { data: promo };
  },

  async update(id: number, data: {
    code_name?: string;
    description?: string;
    type?: "DISCOUNT" | "PERCENT";
    discount?: number;
    expired_at?: string | null;
    max_uses?: number | null;
    max_uses_per_user?: number | null;
  }) {
    const promo = await prisma.promotions.findUnique({ where: { id } });
    if (!promo) return null;

    const updateData: Record<string, unknown> = { ...data };
    if ("expired_at" in data) {
      updateData.expired_at = data.expired_at ? new Date(data.expired_at) : null;
    }
    return prisma.promotions.update({ where: { id }, data: updateData });
  },

  async toggleStatus(id: number) {
    const promo = await prisma.promotions.findUnique({ where: { id }, select: { status: true } });
    if (!promo) return null;
    return prisma.promotions.update({ where: { id }, data: { status: !promo.status } });
  },

  async validate(code: string) {
    const promo = await prisma.promotions.findUnique({ where: { code_name: code } });
    if (!promo) return { valid: false, error: "Promotion code not found" };
    if (!promo.status) return { valid: false, error: "Promotion code is inactive" };
    if (promo.expired_at && promo.expired_at < new Date()) {
      return { valid: false, error: "Promotion code has expired" };
    }
    return {
      valid: true,
      promotion: {
        id: promo.id,
        code_name: promo.code_name,
        type: promo.type,
        discount: promo.discount,
        description: promo.description,
      },
    };
  },
};
