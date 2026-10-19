import { packageService } from "../services/package.service";
import { auditService } from "../services/audit.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

export const packageController = {
  // ── Package Categories ───────────────────────────────────────────────────

  async listCategories({ set }: any) {
    return { success: true, data: await packageService.listCategories(true) };
  },

  async listCategoriesAdmin({ set }: any) {
    return { success: true, data: await packageService.listCategories(false) };
  },

  async createCategory({ user, body, set, request }: any) {
    const result = await packageService.createCategory(body);
    if (result.error) { set.status = 400; return { success: false, message: result.error }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "CREATE", entity: "PACKAGE_CATEGORY", entityId: result.data!.id,
      metadata: { name: result.data!.name },
      ipAddress: getIp(request),
    });
    set.status = 201;
    return { success: true, data: result.data };
  },

  async updateCategory({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid category ID." }; }
    const result = await packageService.updateCategory(id, body);
    if (!result) { set.status = 404; return { success: false, message: "Category not found." }; }
    if ((result as any).error) { set.status = 400; return { success: false, message: (result as any).error }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "UPDATE", entity: "PACKAGE_CATEGORY", entityId: id,
      metadata: body, ipAddress: getIp(request),
    });
    return { success: true, data: (result as any).data };
  },

  async toggleCategoryStatus({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid category ID." }; }
    const cat = await packageService.toggleCategoryStatus(id);
    if (!cat) { set.status = 404; return { success: false, message: "Category not found." }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: cat.status ? "ENABLE" : "DISABLE", entity: "PACKAGE_CATEGORY", entityId: id,
      metadata: { name: cat.name, status: cat.status },
      ipAddress: getIp(request),
    });
    return { success: true, data: cat };
  },

  // ── OS Templates ────────────────────────────────────────────────────────

  async listOs({ set }: any) {
    return { success: true, data: await packageService.listOs() };
  },

  async createOs({ user, body, set, request }: any) {
    const os = await packageService.createOs(body);
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "CREATE", entity: "OS_TEMPLATE", entityId: os.id,
      metadata: { os_name: os.os_name, os_version: os.os_version, vmid: os.vmid },
      ipAddress: getIp(request),
    });
    set.status = 201;
    return { success: true, data: os };
  },

  async updateOs({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid OS ID." }; }
    const os = await packageService.updateOs(id, body);
    if (!os) { set.status = 404; return { success: false, message: "OS template not found." }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "UPDATE", entity: "OS_TEMPLATE", entityId: id,
      metadata: body, ipAddress: getIp(request),
    });
    return { success: true, data: os };
  },

  // ── VM Specs ────────────────────────────────────────────────────────────

  async listVm({ set }: any) {
    return { success: true, data: await packageService.listVm() };
  },

  async createVm({ user, body, set, request }: any) {
    const vm = await packageService.createVm(body);
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "CREATE", entity: "VM_SPEC", entityId: vm.id,
      metadata: { core: vm.core, memory: vm.memory, size: vm.size },
      ipAddress: getIp(request),
    });
    set.status = 201;
    return { success: true, data: vm };
  },

  async updateVm({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VM spec ID." }; }
    const vm = await packageService.updateVm(id, body);
    if (!vm) { set.status = 404; return { success: false, message: "VM spec not found." }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "UPDATE", entity: "VM_SPEC", entityId: id,
      metadata: body, ipAddress: getIp(request),
    });
    return { success: true, data: vm };
  },

  // ── Packages ────────────────────────────────────────────────────────────

  async listActive({ query, set }: any) {
    const category_id = query?.category_id ? parseInt(query.category_id, 10) : undefined;
    return { success: true, data: await packageService.listActive(category_id) };
  },

  async getById({ params, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid package ID." }; }
    const pkg = await packageService.getById(id);
    if (!pkg) { set.status = 404; return { success: false, message: "Package not found." }; }
    return { success: true, data: pkg };
  },

  async create({ user, body, set, request }: any) {
    const result = await packageService.create(body);
    if (result.error) { set.status = 400; return { success: false, message: result.error }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "CREATE", entity: "PACKAGE", entityId: result.data!.id,
      metadata: { name: result.data!.name, price: result.data!.price, period: result.data!.period },
      ipAddress: getIp(request),
    });
    set.status = 201;
    return { success: true, data: result.data };
  },

  async update({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid package ID." }; }
    const pkg = await packageService.update(id, body);
    if (!pkg) { set.status = 404; return { success: false, message: "Package not found." }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "UPDATE", entity: "PACKAGE", entityId: id,
      metadata: body, ipAddress: getIp(request),
    });
    return { success: true, data: pkg };
  },

  async toggleStatus({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid package ID." }; }
    const pkg = await packageService.toggleStatus(id);
    if (!pkg) { set.status = 404; return { success: false, message: "Package not found." }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: pkg.status ? "ENABLE" : "DISABLE", entity: "PACKAGE", entityId: id,
      metadata: { name: pkg.name, status: pkg.status },
      ipAddress: getIp(request),
    });
    return { success: true, data: pkg };
  },
};
