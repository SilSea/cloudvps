export interface PackageCategory {
  id: number
  name: string
  description?: string
  status: boolean
}

export interface OsTemplate {
  id: number
  os_name: string
  os_version: string
  vmid: number
  status: boolean
}

export interface VmSpec {
  id: number
  core: number
  memory: string
  size: string
  status: boolean
}

export interface Package {
  id: number
  name: string
  description: string
  price: number
  period: number
  os_id: number
  vm_id: number
  port_count: number | null
  category_id: number | null
  status: boolean
  os: { os_name: string; os_version: string }
  vm: { core: number; memory: string; size: string }
  category: { id: number; name: string } | null
  available: boolean
}
