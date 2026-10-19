import { mock, describe, it, expect, beforeEach } from "bun:test";

mock.module("../../src/config/database", () => ({
  prisma: {
    os: {
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 1, status: true })),
      update: mock(() => Promise.resolve({ id: 1 })),
    },
    vm: {
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 1, status: true })),
      update: mock(() => Promise.resolve({ id: 1 })),
    },
    packages: {
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 1, status: true })),
      update: mock(() => Promise.resolve({ id: 1 })),
    },
    package_categories: {
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 1, name: "General", status: true })),
      update: mock(() => Promise.resolve({ id: 1, name: "General", status: true })),
    },
  },
}));

import { packageService } from "../../src/services/package.service";
import { prisma } from "../../src/config/database";

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

const sampleOs  = { id: 1, os_name: "Ubuntu", os_version: "22.04", vmid: 100, status: true };
const sampleVm  = { id: 1, core: 2, memory: "2GB", size: "40GB", status: true };
const samplePkg = { id: 1, name: "Starter", status: true };
const sampleCat = { id: 1, name: "General", description: null, status: true };

beforeEach(() => {
  asMock((prisma as any).os.findMany).mockResolvedValue([]);
  asMock((prisma as any).os.findUnique).mockResolvedValue(null);
  asMock((prisma as any).os.create).mockResolvedValue({ id: 1, status: true });
  asMock((prisma as any).os.update).mockResolvedValue({ id: 1 });
  asMock((prisma as any).vm.findMany).mockResolvedValue([]);
  asMock((prisma as any).vm.findUnique).mockResolvedValue(null);
  asMock((prisma as any).vm.create).mockResolvedValue({ id: 1, status: true });
  asMock((prisma as any).vm.update).mockResolvedValue({ id: 1 });
  asMock((prisma as any).packages.findMany).mockResolvedValue([]);
  asMock((prisma as any).packages.findUnique).mockResolvedValue(null);
  asMock((prisma as any).packages.create).mockResolvedValue({ id: 1, status: true });
  asMock((prisma as any).packages.update).mockResolvedValue({ id: 1 });
  asMock((prisma as any).package_categories.findMany).mockResolvedValue([]);
  asMock((prisma as any).package_categories.findUnique).mockResolvedValue(null);
  asMock((prisma as any).package_categories.create).mockResolvedValue({ id: 1, name: "General", status: true });
  asMock((prisma as any).package_categories.update).mockResolvedValue({ id: 1, name: "General", status: true });
});

// =============================================================================
// OS Templates
// =============================================================================

describe("packageService — OS Templates", () => {
  it("listOs calls findMany ordered by created_at desc", async () => {
    await packageService.listOs();
    const callArg = asMock((prisma as any).os.findMany).mock.calls.at(-1)![0];
    expect(callArg.orderBy).toEqual({ created_at: "desc" });
  });

  it("createOs creates with status=true", async () => {
    await packageService.createOs({ os_name: "Ubuntu", os_version: "22.04", vmid: 100 });
    const callArg = asMock((prisma as any).os.create).mock.calls[0][0];
    expect(callArg.data.status).toBe(true);
  });

  it("updateOs returns null when OS does not exist", async () => {
    const result = await packageService.updateOs(999, { os_name: "Debian" });
    expect(result).toBeNull();
  });

  it("updateOs updates on happy path", async () => {
    asMock((prisma as any).os.findUnique).mockResolvedValueOnce(sampleOs);
    asMock((prisma as any).os.update).mockResolvedValueOnce({ ...sampleOs, os_name: "Debian" });
    const result = await packageService.updateOs(1, { os_name: "Debian" });
    expect(result).toBeDefined();
  });
});

// =============================================================================
// VM Specs
// =============================================================================

describe("packageService — VM Specs", () => {
  it("listVm calls findMany ordered by created_at desc", async () => {
    await packageService.listVm();
    const callArg = asMock((prisma as any).vm.findMany).mock.calls.at(-1)![0];
    expect(callArg.orderBy).toEqual({ created_at: "desc" });
  });

  it("createVm creates with status=true", async () => {
    await packageService.createVm({ core: 2, memory: "2GB", size: "40GB" });
    const callArg = asMock((prisma as any).vm.create).mock.calls[0][0];
    expect(callArg.data.status).toBe(true);
  });

  it("updateVm returns null when VM does not exist", async () => {
    const result = await packageService.updateVm(999, { core: 4 });
    expect(result).toBeNull();
  });

  it("updateVm updates on happy path", async () => {
    asMock((prisma as any).vm.findUnique).mockResolvedValueOnce(sampleVm);
    const result = await packageService.updateVm(1, { core: 4 });
    expect(result).toBeDefined();
  });
});

// =============================================================================
// Packages
// =============================================================================

describe("packageService — Packages", () => {
  it("listActive queries packages with status=true", async () => {
    await packageService.listActive();
    const callArg = asMock((prisma as any).packages.findMany).mock.calls.at(-1)![0];
    expect(callArg.where).toEqual({ status: true });
  });

  it("getById calls findUnique with correct id", async () => {
    await packageService.getById(5);
    expect(asMock((prisma as any).packages.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 } })
    );
  });

  it("create returns error when OS not found", async () => {
    // os.findUnique returns null, vm returns valid
    asMock((prisma as any).vm.findUnique).mockResolvedValueOnce(sampleVm);
    const result = await packageService.create({
      name: "Test", description: "Desc", price: 500, period: 30, os_id: 999, vm_id: 1,
    });
    expect((result as any).error).toBe("OS template not found");
  });

  it("create returns error when VM not found", async () => {
    asMock((prisma as any).os.findUnique).mockResolvedValueOnce(sampleOs);
    // vm.findUnique returns null
    const result = await packageService.create({
      name: "Test", description: "Desc", price: 500, period: 30, os_id: 1, vm_id: 999,
    });
    expect((result as any).error).toBe("VM spec not found");
  });

  it("create returns data on happy path", async () => {
    asMock((prisma as any).os.findUnique).mockResolvedValueOnce(sampleOs);
    asMock((prisma as any).vm.findUnique).mockResolvedValueOnce(sampleVm);
    asMock((prisma as any).packages.create).mockResolvedValueOnce({ id: 1, name: "Starter", status: true });
    const result = await packageService.create({
      name: "Starter", description: "Entry", price: 500, period: 30, os_id: 1, vm_id: 1,
    }) as any;
    expect(result.data).toBeDefined();
  });

  it("update returns null when package does not exist", async () => {
    const result = await packageService.update(999, { name: "New" });
    expect(result).toBeNull();
  });

  it("update calls update on happy path", async () => {
    asMock((prisma as any).packages.findUnique).mockResolvedValueOnce(samplePkg);
    await packageService.update(1, { name: "Updated" });
    expect(asMock((prisma as any).packages.update)).toHaveBeenCalled();
  });

  it("toggleStatus returns null when package does not exist", async () => {
    const result = await packageService.toggleStatus(999);
    expect(result).toBeNull();
  });

  it("toggleStatus flips active package to inactive", async () => {
    asMock((prisma as any).packages.findUnique).mockResolvedValueOnce({
      id: 1, status: true, _count: { orders: 0 },
    });
    await packageService.toggleStatus(1);
    const callArg = asMock((prisma as any).packages.update).mock.calls.at(-1)![0];
    expect(callArg.data.status).toBe(false);
  });

  it("create returns error when category_id not found", async () => {
    asMock((prisma as any).os.findUnique).mockResolvedValueOnce(sampleOs);
    asMock((prisma as any).vm.findUnique).mockResolvedValueOnce(sampleVm);
    // package_categories.findUnique returns null
    const result = await packageService.create({
      name: "Test", description: "Desc", price: 500, period: 30, os_id: 1, vm_id: 1, category_id: 999,
    });
    expect((result as any).error).toBe("Category not found");
  });

  it("create passes category_id through on happy path", async () => {
    asMock((prisma as any).os.findUnique).mockResolvedValueOnce(sampleOs);
    asMock((prisma as any).vm.findUnique).mockResolvedValueOnce(sampleVm);
    asMock((prisma as any).package_categories.findUnique).mockResolvedValueOnce(sampleCat);
    asMock((prisma as any).packages.create).mockResolvedValueOnce({ id: 1, name: "Pro", category_id: 1, status: true });
    const result = await packageService.create({
      name: "Pro", description: "Pro tier", price: 800, period: 30, os_id: 1, vm_id: 1, category_id: 1,
    }) as any;
    expect(result.data.category_id).toBe(1);
  });

  it("update returns error when category_id not found", async () => {
    asMock((prisma as any).packages.findUnique).mockResolvedValueOnce(samplePkg);
    // package_categories.findUnique returns null
    const result = await packageService.update(1, { category_id: 999 });
    expect((result as any).error).toBe("Category not found");
  });

  it("listActive passes category_id filter", async () => {
    await packageService.listActive(2);
    const callArg = asMock((prisma as any).packages.findMany).mock.calls.at(-1)![0];
    expect(callArg.where).toMatchObject({ status: true, category_id: 2 });
  });
});

// =============================================================================
// Package Categories
// =============================================================================

describe("packageService — Package Categories", () => {
  it("listCategories(false) calls findMany without where filter", async () => {
    await packageService.listCategories(false);
    const callArg = asMock((prisma as any).package_categories.findMany).mock.calls.at(-1)![0];
    expect(callArg.where).toBeUndefined();
  });

  it("listCategories(true) filters status=true", async () => {
    await packageService.listCategories(true);
    const callArg = asMock((prisma as any).package_categories.findMany).mock.calls.at(-1)![0];
    expect(callArg.where).toEqual({ status: true });
  });

  it("createCategory returns error when name already exists", async () => {
    asMock((prisma as any).package_categories.findUnique).mockResolvedValueOnce(sampleCat);
    const result = await packageService.createCategory({ name: "General" });
    expect((result as any).error).toBe("Category name already exists");
  });

  it("createCategory creates with status=true on happy path", async () => {
    const result = await packageService.createCategory({ name: "Gaming" }) as any;
    expect(result.data).toBeDefined();
    const callArg = asMock((prisma as any).package_categories.create).mock.calls.at(-1)![0];
    expect(callArg.data.status).toBe(true);
  });

  it("updateCategory returns null when category not found", async () => {
    const result = await packageService.updateCategory(999, { name: "X" });
    expect(result).toBeNull();
  });

  it("updateCategory returns error on duplicate name", async () => {
    asMock((prisma as any).package_categories.findUnique)
      .mockResolvedValueOnce(sampleCat)           // find by id
      .mockResolvedValueOnce({ id: 2, name: "Gaming" }); // dup name check
    const result = await packageService.updateCategory(1, { name: "Gaming" });
    expect((result as any).error).toBe("Category name already exists");
  });

  it("updateCategory updates on happy path", async () => {
    asMock((prisma as any).package_categories.findUnique).mockResolvedValueOnce(sampleCat);
    const result = await packageService.updateCategory(1, { description: "Updated desc" }) as any;
    expect(result.data).toBeDefined();
  });

  it("toggleCategoryStatus returns null when not found", async () => {
    const result = await packageService.toggleCategoryStatus(999);
    expect(result).toBeNull();
  });

  it("toggleCategoryStatus flips status", async () => {
    asMock((prisma as any).package_categories.findUnique).mockResolvedValueOnce(sampleCat);
    await packageService.toggleCategoryStatus(1);
    const callArg = asMock((prisma as any).package_categories.update).mock.calls.at(-1)![0];
    expect(callArg.data.status).toBe(!sampleCat.status);
  });
});
