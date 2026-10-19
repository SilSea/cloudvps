import { prisma } from "../config/database";
import { capacityService } from "./capacity.service";
import { systemConfigService } from "./system-config.service";

export const packageService = {
  // ── Package Categories ────────────────────────────────────────────────────

  async listCategories(activeOnly = false) {
    return prisma.package_categories.findMany({
      where: activeOnly ? { status: true } : undefined,
      orderBy: { name: "asc" },
    });
  },

  async getCategoryById(id: number) {
    return prisma.package_categories.findUnique({ where: { id } });
  },

  async createCategory(data: { name: string; description?: string }) {
    const exists = await prisma.package_categories.findUnique({ where: { name: data.name } });
    if (exists) return { error: "Category name already exists" };
    return { data: await prisma.package_categories.create({ data: { ...data, status: true } }) };
  },

  async updateCategory(id: number, data: { name?: string; description?: string }) {
    const cat = await prisma.package_categories.findUnique({ where: { id } });
    if (!cat) return null;
    if (data.name && data.name !== cat.name) {
      const dup = await prisma.package_categories.findUnique({ where: { name: data.name } });
      if (dup) return { error: "Category name already exists" };
    }
    return { data: await prisma.package_categories.update({ where: { id }, data }) };
  },

  async toggleCategoryStatus(id: number) {
    const cat = await prisma.package_categories.findUnique({ where: { id } });
    if (!cat) return null;
    return prisma.package_categories.update({ where: { id }, data: { status: !cat.status } });
  },

  // ── OS Templates ──────────────────────────────────────────────────────────

  async listOs() {
    return prisma.os.findMany({ orderBy: { created_at: "desc" } });
  },

  async createOs(data: { os_name: string; os_version: string; vmid: number }) {
    return prisma.os.create({ data: { ...data, status: true } });
  },

  async updateOs(id: number, data: { os_name?: string; os_version?: string; vmid?: number }) {
    const os = await prisma.os.findUnique({ where: { id } });
    if (!os) return null;
    return prisma.os.update({ where: { id }, data });
  },

  // ── VM Specs ──────────────────────────────────────────────────────────────

  async listVm() {
    return prisma.vm.findMany({ orderBy: { created_at: "desc" } });
  },

  async createVm(data: { core: number; memory: string; size: string }) {
    return prisma.vm.create({ data: { ...data, status: true } });
  },

  async updateVm(id: number, data: { core?: number; memory?: string; size?: string }) {
    const vm = await prisma.vm.findUnique({ where: { id } });
    if (!vm) return null;
    return prisma.vm.update({ where: { id }, data });
  },

  // ── Packages ──────────────────────────────────────────────────────────────

  async listActive(category_id?: number) {
    const packages = await prisma.packages.findMany({
      where: { status: true, ...(category_id ? { category_id } : {}) },
      include: {
        os: { select: { os_name: true, os_version: true } },
        vm: { select: { core: true, memory: true, size: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { price: "asc" },
    });

    let snapshot = null;
    let minFreeRamMb = 1024;
    let minFreeDiskGb = 10;
    try {
      const [snap, minRamRaw, minDiskRaw] = await Promise.all([
        capacityService.getSnapshot(),
        systemConfigService.get("capacity.min_free_ram_mb"),
        systemConfigService.get("capacity.min_free_disk_gb"),
      ]);
      snapshot = snap;
      minFreeRamMb = parseInt(minRamRaw ?? "1024", 10);
      minFreeDiskGb = parseInt(minDiskRaw ?? "10", 10);
    } catch {}

    return packages.map((pkg) => ({
      ...pkg,
      available:
        snapshot && pkg.vm
          ? capacityService.isPackageFit(pkg.vm, snapshot, minFreeRamMb, minFreeDiskGb)
          : true,
    }));
  },

  async getById(id: number) {
    return prisma.packages.findUnique({
      where: { id },
      include: {
        os: { select: { os_name: true, os_version: true } },
        vm: { select: { core: true, memory: true, size: true } },
        category: { select: { id: true, name: true } },
      },
    });
  },

  async create(data: {
    name: string;
    description: string;
    price: number;
    period: number;
    os_id: number;
    vm_id: number;
    port_count?: number;
    category_id?: number;
  }) {
    const [os, vm] = await Promise.all([
      prisma.os.findUnique({ where: { id: data.os_id } }),
      prisma.vm.findUnique({ where: { id: data.vm_id } }),
    ]);
    if (!os) return { error: "OS template not found" };
    if (!vm) return { error: "VM spec not found" };
    if (data.category_id) {
      const cat = await prisma.package_categories.findUnique({ where: { id: data.category_id } });
      if (!cat) return { error: "Category not found" };
    }
    return { data: await prisma.packages.create({ data: { ...data, status: true } }) };
  },

  async update(id: number, data: {
    name?: string;
    description?: string;
    price?: number;
    period?: number;
    os_id?: number;
    vm_id?: number;
    port_count?: number | null;
    category_id?: number | null;
  }) {
    const pkg = await prisma.packages.findUnique({ where: { id } });
    if (!pkg) return null;
    if (data.category_id) {
      const cat = await prisma.package_categories.findUnique({ where: { id: data.category_id } });
      if (!cat) return { error: "Category not found" };
    }
    return prisma.packages.update({ where: { id }, data });
  },

  async toggleStatus(id: number) {
    const pkg = await prisma.packages.findUnique({
      where: { id },
      select: { status: true, _count: { select: { orders: true } } },
    });
    if (!pkg) return null;
    return prisma.packages.update({ where: { id }, data: { status: !pkg.status } });
  },
};
