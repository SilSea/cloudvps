import { ApiClient } from "./client"
import type { Package, PackageCategory, OsTemplate, VmSpec } from "@/types/package"

export interface CreateCategoryInput {
  name: string
  description?: string
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>

export interface CreatePackageInput {
  name: string
  description?: string
  os_id: number
  vm_id: number
  price: number
  period: number
  port_count?: number | null
  category_id?: number | null
}

export type UpdatePackageInput = Partial<CreatePackageInput> & { status?: boolean }

export class PackageService extends ApiClient {
  static async list(categoryId?: number): Promise<Package[]> {
    const query = categoryId ? `?category_id=${categoryId}` : ""
    return this.get<Package[]>(`/api/packages${query}`)
  }

  static async getById(id: number): Promise<Package> {
    return this.get<Package>(`/api/packages/${id}`)
  }

  static async getCategories(): Promise<PackageCategory[]> {
    return this.get<PackageCategory[]>("/api/packages/categories")
  }

  static async listCategoriesAdmin(token: string): Promise<PackageCategory[]> {
    return this.get<PackageCategory[]>("/api/packages/categories/all", { token })
  }

  static async createCategory(data: CreateCategoryInput, token: string): Promise<PackageCategory> {
    return this.post<PackageCategory>("/api/packages/categories", data, { token })
  }

  static async updateCategory(id: number, data: UpdateCategoryInput, token: string): Promise<PackageCategory> {
    return this.put<PackageCategory>(`/api/packages/categories/${id}`, data, { token })
  }

  static async toggleCategoryStatus(id: number, token: string): Promise<PackageCategory> {
    return this.patch<PackageCategory>(`/api/packages/categories/${id}/status`, undefined, { token })
  }

  static async listOsTemplates(token: string): Promise<OsTemplate[]> {
    return this.get<OsTemplate[]>("/api/packages/os", { token })
  }

  static async listVmSpecs(token: string): Promise<VmSpec[]> {
    return this.get<VmSpec[]>("/api/packages/vm", { token })
  }

  // OS Templates
  static async createOs(data: { os_name: string; os_version: string; vmid: number }, token: string): Promise<OsTemplate> {
    return this.post<OsTemplate>("/api/packages/os", data, { token })
  }

  static async updateOs(id: number, data: { os_name?: string; os_version?: string; vmid?: number }, token: string): Promise<OsTemplate> {
    return this.put<OsTemplate>(`/api/packages/os/${id}`, data, { token })
  }

  // VM Specs
  static async createVm(data: { core: number; memory: string; size: string }, token: string): Promise<VmSpec> {
    return this.post<VmSpec>("/api/packages/vm", data, { token })
  }

  static async updateVm(id: number, data: { core?: number; memory?: string; size?: string }, token: string): Promise<VmSpec> {
    return this.put<VmSpec>(`/api/packages/vm/${id}`, data, { token })
  }

  static async create(data: CreatePackageInput, token: string): Promise<Package> {
    // backend create: no status field; port_count and category_id must be omitted (not null) when absent
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status: _s, port_count, category_id, ...rest } = data as CreatePackageInput & { status?: boolean }
    const body = {
      ...rest,
      ...(port_count != null ? { port_count } : {}),
      ...(category_id != null ? { category_id } : {}),
    }
    return this.post<Package>("/api/packages", body, { token })
  }

  static async update(id: number, data: UpdatePackageInput, token: string): Promise<Package> {
    // backend PUT: no status field; port_count omit when null; category_id accepts null (Nullable)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status: _s, port_count, ...rest } = data
    const body = port_count != null ? { ...rest, port_count } : rest
    return this.put<Package>(`/api/packages/${id}`, body, { token })
  }

  // Pure toggle (no body) — the only way to change package status, since create/PUT don't accept it
  static async toggleStatus(id: number, token: string): Promise<Package> {
    return this.patch<Package>(`/api/packages/${id}/status`, undefined, { token })
  }

  static async remove(id: number, token: string): Promise<void> {
    return this.delete<void>(`/api/packages/${id}`, { token })
  }
}
