import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/hash";
import { DEFAULT_TEMPLATES } from "../src/services/email-template.service";

const prisma = new PrismaClient();

// ── Roles ──────────────────────────────────────────────────────────────────

async function seedRoles() {
  const roles = ["admin", "support", "users"] as const;
  for (const name of roles) {
    const exists = await prisma.roles.findFirst({ where: { role_name: name } });
    if (!exists) {
      await prisma.roles.create({ data: { role_name: name, status: true } });
      console.log(`  [roles] created: ${name}`);
    }
  }
}

// ── Policies ───────────────────────────────────────────────────────────────

async function seedPolicies() {
  const policies = [
    {
      policie_title: "นโยบายความเป็นส่วนตัว (PDPA)",
      policies_detail:
        "บริษัทเก็บรวบรวมข้อมูลส่วนบุคคลของท่านเพื่อใช้ในการให้บริการ VPS Cloud ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ข้อมูลที่เก็บรวบรวมได้แก่ ชื่อ-นามสกุล อีเมล หมายเลขโทรศัพท์ และที่อยู่สำหรับการออกใบเสร็จ",
      policies_type: "PDPA" as const,
      version: "1.0",
    },
    {
      policie_title: "ข้อกำหนดการให้บริการ",
      policies_detail:
        "ท่านตกลงใช้บริการ CloudVPS VPS ตามข้อกำหนดและเงื่อนไขที่กำหนดไว้ ห้ามใช้บริการเพื่อวัตถุประสงค์ที่ผิดกฎหมาย บริษัทขอสงวนสิทธิ์ในการระงับบริการหากพบการละเมิดข้อกำหนด",
      policies_type: "TERMSERVICE" as const,
      version: "1.0",
    },
  ];

  for (const p of policies) {
    const exists = await prisma.policies.findFirst({
      where: { policies_type: p.policies_type, version: p.version },
    });
    if (!exists) {
      await prisma.policies.create({ data: { ...p, status: true } });
      console.log(`  [policies] created: ${p.policies_type} v${p.version}`);
    }
  }
}

// ── Users ──────────────────────────────────────────────────────────────────

async function seedUsers() {
  const activePolicies = await prisma.policies.findMany({ where: { status: true }, select: { id: true } });
  const policyIds = activePolicies.map((p) => p.id);

  const usersData = [
    {
      email: "admin@cloudvps.com",
      roleName: "admin",
      info: { first_name: "Admin", last_name: "CloudVPS", phone: "0800000001" },
    },
    {
      email: "support@cloudvps.com",
      roleName: "support",
      info: { first_name: "Support", last_name: "CloudVPS", phone: "0800000002" },
    },
    {
      email: "user@cloudvps.com",
      roleName: "users",
      info: { first_name: "Test", last_name: "User", phone: "0800000003" },
    },
  ];

  const hashed = await hashPassword("Password1234!");

  for (const u of usersData) {
    const exists = await prisma.users.findUnique({ where: { email: u.email } });
    if (exists) continue;

    const role = await prisma.roles.findFirst({ where: { role_name: u.roleName } });
    if (!role) continue;

    await prisma.users.create({
      data: {
        email: u.email,
        password: hashed,
        role_id: role.id,
        status: true,
        is_verify: true,
        users_info: {
          create: {
            first_name: u.info.first_name,
            last_name: u.info.last_name,
            phone: u.info.phone,
            address1: "123 ถนนทดสอบ",
            address2: "ห้อง 101",
            address3: "แขวงลาดยาว",
            address4: "เขตจตุจักร",
            address5: "10900",
            address6: "Thailand",
          },
        },
        consents: {
          create: policyIds.map((pid) => ({ policies_id: pid })),
        },
      },
    });
    console.log(`  [users] created: ${u.email} (${u.roleName})`);
  }
}

// ── OS Templates ───────────────────────────────────────────────────────────

async function seedOs() {
  const templates = [
    { os_name: "Ubuntu", os_version: "22.04 LTS", vmid: 21024 },
    { os_name: "Ubuntu", os_version: "20.04 LTS", vmid: 101 },
    { os_name: "Debian", os_version: "12",        vmid: 102 },
    { os_name: "Windows Server", os_version: "2022", vmid: 103 },
  ];

  for (const t of templates) {
    const exists = await prisma.os.findFirst({ where: { os_name: t.os_name, os_version: t.os_version } });
    if (!exists) {
      await prisma.os.create({ data: { ...t, status: true } });
      console.log(`  [os] created: ${t.os_name} ${t.os_version}`);
    }
  }
}

// ── VM Specs ───────────────────────────────────────────────────────────────

async function seedVm() {
  const specs = [
    { core: 2,  memory: "2GB",  size: "40GB"  },
    { core: 2,  memory: "4GB",  size: "60GB"  },
    { core: 4,  memory: "4GB",  size: "80GB"  },
    { core: 4,  memory: "8GB",  size: "100GB" },
    { core: 6,  memory: "8GB",  size: "150GB" },
    { core: 6,  memory: "12GB", size: "200GB" },
    { core: 8,  memory: "16GB", size: "250GB" },
    { core: 10, memory: "20GB", size: "300GB" },
  ];

  for (const s of specs) {
    const exists = await prisma.vm.findFirst({ where: { core: s.core, memory: s.memory, size: s.size } });
    if (!exists) {
      await prisma.vm.create({ data: { ...s, status: true } });
      console.log(`  [vm] created: ${s.core}c / ${s.memory} / ${s.size}`);
    }
  }
}

// ── Packages ───────────────────────────────────────────────────────────────

async function seedPackages() {
  const ubuntu = await prisma.os.findFirst({ where: { os_name: "Ubuntu", os_version: "22.04 LTS" } });
  if (!ubuntu) { console.log("  [packages] skipped — Ubuntu 22.04 not found"); return; }

  const vms = await prisma.vm.findMany({ orderBy: { core: "asc" } });
  if (vms.length < 8) { console.log("  [packages] skipped — not enough VM specs"); return; }

  const packages = [
    { name: "Basic VPS",        description: "เหมาะสำหรับเว็บไซต์ขนาดเล็กและโปรเจกต์ทดสอบ",  price: 199,  period: 30, vmIdx: 0 },
    { name: "Starter VPS",      description: "เหมาะสำหรับเว็บไซต์ทั่วไปและแอปพลิเคชันเบา",    price: 299,  period: 30, vmIdx: 1 },
    { name: "Standard VPS",     description: "เหมาะสำหรับเว็บไซต์ธุรกิจและฐานข้อมูลขนาดกลาง", price: 499,  period: 30, vmIdx: 2 },
    { name: "Professional VPS", description: "เหมาะสำหรับแอปพลิเคชันที่ต้องการประสิทธิภาพสูง", price: 799,  period: 30, vmIdx: 3 },
    { name: "Business VPS",     description: "เหมาะสำหรับธุรกิจที่ต้องการทรัพยากรเพิ่มเติม",   price: 1199, period: 30, vmIdx: 4 },
    { name: "Advanced VPS",     description: "เหมาะสำหรับระบบที่ต้องการ RAM และ CPU สูง",       price: 1599, period: 30, vmIdx: 5 },
    { name: "Enterprise VPS",   description: "เหมาะสำหรับองค์กรที่ต้องการทรัพยากรขนาดใหญ่",   price: 2399, period: 30, vmIdx: 6 },
    { name: "Ultimate VPS",     description: "ประสิทธิภาพสูงสุดสำหรับระบบ High-Performance",    price: 3499, period: 30, vmIdx: 7 },
  ];

  for (const p of packages) {
    const exists = await prisma.packages.findFirst({ where: { name: p.name } });
    if (!exists) {
      await prisma.packages.create({
        data: {
          name: p.name,
          description: p.description,
          price: p.price,
          period: p.period,
          os_id: ubuntu.id,
          vm_id: vms[p.vmIdx].id,
          status: true,
        },
      });
      console.log(`  [packages] created: ${p.name} (${p.price} THB/mo)`);
    }
  }
}

// ── IP Pools ───────────────────────────────────────────────────────────────

async function seedIpPools() {
  const ips = [
    { ip: "198.51.100.1", type: "PUBLIC"  as const },
    { ip: "198.51.100.2", type: "PUBLIC"  as const },
    { ip: "198.51.100.3", type: "PUBLIC"  as const },
    { ip: "172.16.1.1",  type: "PRIVATE" as const },
    { ip: "172.16.1.2",  type: "PRIVATE" as const },
  ];

  for (const i of ips) {
    const exists = await prisma.ip_pools.findFirst({ where: { ip: i.ip } });
    if (!exists) {
      await prisma.ip_pools.create({ data: { ...i, status: true } });
      console.log(`  [ip_pools] created: ${i.ip} (${i.type})`);
    }
  }
}

// ── Promotions ─────────────────────────────────────────────────────────────

async function seedPromotions() {
  const promos = [
    {
      code_name: "WELCOME10",
      description: "ส่วนลด 10% สำหรับสมาชิกใหม่",
      type: "PERCENT" as const,
      discount: 10,
      expired_at: null,
    },
    {
      code_name: "SAVE100",
      description: "ส่วนลด 100 บาท สำหรับแพ็คเกจ Standard ขึ้นไป",
      type: "DISCOUNT" as const,
      discount: 100,
      expired_at: new Date("2026-12-31"),
    },
  ];

  for (const p of promos) {
    const exists = await prisma.promotions.findUnique({ where: { code_name: p.code_name } });
    if (!exists) {
      await prisma.promotions.create({ data: { ...p, status: true } });
      console.log(`  [promotions] created: ${p.code_name}`);
    }
  }
}

// ── System Configs ─────────────────────────────────────────────────────────

async function seedSystemConfigs() {
  // Only Proxmox credentials are runtime-editable via system_configs.
  // SMTP and payment (SlipOK, TrueMoney) credentials are configured via .env.
  const configs = [
    // Proxmox VE — connection
    { key: "proxmox.host",            category: "proxmox", is_secret: false, description: "Proxmox VE host/IP (e.g. 10.0.0.1)" },
    { key: "proxmox.token_id",        category: "proxmox", is_secret: false, description: "Proxmox API token ID (user@realm!tokenname)" },
    { key: "proxmox.token_secret",    category: "proxmox", is_secret: true,  description: "Proxmox API token secret UUID" },
    { key: "proxmox.node",            category: "proxmox", is_secret: false, description: "Proxmox node name (e.g. pve)" },
    // Proxmox VE — provisioning
    { key: "proxmox.storage",         category: "proxmox", is_secret: false, description: "Storage pool for VM disks (e.g. local-lvm)" },
    { key: "proxmox.bridge.public",  category: "proxmox", is_secret: false, description: "Network bridge for PUBLIC IP VMs (e.g. vmbr0)" },
    { key: "proxmox.bridge.private", category: "proxmox", is_secret: false, description: "Network bridge for PRIVATE IP VMs (e.g. vmbr1)" },
    { key: "proxmox.gateway_public",  category: "proxmox", is_secret: false, description: "Default gateway for PUBLIC IPs" },
    { key: "proxmox.gateway_private", category: "proxmox", is_secret: false, description: "Default gateway for PRIVATE IPs" },
    { key: "proxmox.subnet",          category: "proxmox", is_secret: false, description: "Subnet prefix length (e.g. 24)" },
    { key: "proxmox.default_user.linux",   category: "proxmox", is_secret: false, description: "cloud-init default user for Linux VMs (e.g. root, ubuntu)" },
    { key: "proxmox.default_user.windows", category: "proxmox", is_secret: false, description: "Default user for Windows VMs (e.g. Administrator)" },
    // Pricing — custom resource upgrades
    { key: "pricing.cpu_per_core",    category: "pricing",  is_secret: false, description: "Monthly price per vCPU core (THB)" },
    { key: "pricing.ram_per_gib",     category: "pricing",  is_secret: false, description: "Monthly price per GiB RAM (THB)" },
    { key: "pricing.disk_per_gb",     category: "pricing",  is_secret: false, description: "Monthly price per GB disk (THB)" },
    // MikroTik CHR — NAT / Port Forwarding (Phase 8)
    { key: "mikrotik.host",           category: "mikrotik", is_secret: false, description: "MikroTik CHR REST API base URL (e.g. https://10.0.0.2)" },
    { key: "mikrotik.username",       category: "mikrotik", is_secret: false, description: "MikroTik API username" },
    { key: "mikrotik.password",       category: "mikrotik", is_secret: true,  description: "MikroTik API password" },
    { key: "mikrotik.nat_public_ip",  category: "mikrotik", is_secret: false, description: "Public IP on MikroTik CHR used for DST-NAT rules" },
    { key: "mikrotik.nat_base_port",  category: "mikrotik", is_secret: false, description: "First port number for NAT port block allocation (e.g. 20000)" },
    // Capacity lock
    { key: "capacity.check_enabled",   category: "capacity", is_secret: false, description: "Enable resource capacity check before order creation (true/false, default true)" },
    { key: "capacity.min_free_ram_mb", category: "capacity", is_secret: false, description: "Minimum free RAM MB to keep reserved after allocation (default 1024)" },
    { key: "capacity.min_free_disk_gb",category: "capacity", is_secret: false, description: "Minimum free disk GB to keep reserved after allocation (default 10)" },
    // Payment — slip upload mode + payment credentials
    { key: "payment.slip_mode",        category: "payment",  is_secret: false, description: "Slip upload mode: FILE (multipart disk, default) | BASE64 (raw base64 string)" },
    { key: "payment.promptpay_id",     category: "payment",  is_secret: false, description: "PromptPay account ID — phone number (10 digits) or national ID (13 digits)" },
    { key: "payment.slipok_api_key",   category: "payment",  is_secret: true,  description: "SlipOK API key (x-authorization header)" },
    { key: "payment.slipok_branch_id", category: "payment",  is_secret: false, description: "SlipOK branch ID used in API URL path" },
    { key: "payment.bank_code",        category: "payment",  is_secret: false, description: "Bank code for transfer display (e.g. KBANK, SCB, KTB, BBL, BAY)" },
    { key: "payment.bank_account_no",  category: "payment",  is_secret: false, description: "Bank account number for transfer display" },
    { key: "payment.bank_account_name",category: "payment",  is_secret: false, description: "Bank account holder name for transfer display" },
    { key: "payment.truemoney_mobile", category: "payment",  is_secret: false, description: "TrueMoney Wallet phone number for voucher redemption" },
  ];

  for (const c of configs) {
    const exists = await prisma.system_configs.findUnique({ where: { key: c.key } });
    if (!exists) {
      await prisma.system_configs.create({
        data: { key: c.key, value: null, description: c.description, is_secret: c.is_secret, category: c.category },
      });
      console.log(`  [system_configs] created: ${c.key}`);
    }
  }
}

// ── Email Templates ────────────────────────────────────────────────────────

async function seedEmailTemplates() {
  for (const [type, tpl] of Object.entries(DEFAULT_TEMPLATES) as [any, any][]) {
    const exists = await prisma.email_templates.findUnique({ where: { type } });
    if (!exists) {
      await prisma.email_templates.create({
        data: { type, subject: tpl.subject, body_html: tpl.body_html, is_active: true },
      });
      console.log(`  [email_templates] created: ${type}`);
    }
  }
}

// ── Ticket Categories ──────────────────────────────────────────────────────

async function seedTicketCategories() {
  const categories = [
    { name: "Billing",   description: "ปัญหาเกี่ยวกับการชำระเงินและ invoice" },
    { name: "Technical", description: "ปัญหาด้านเทคนิคและ VPS" },
    { name: "Account",   description: "ปัญหาเกี่ยวกับบัญชีผู้ใช้" },
    { name: "Other",     description: "คำถามและปัญหาอื่นๆ" },
  ];
  for (const c of categories) {
    const exists = await prisma.ticket_categories.findUnique({ where: { name: c.name } });
    if (!exists) {
      await prisma.ticket_categories.create({ data: { ...c, status: true } });
      console.log(`  [ticket_categories] created: ${c.name}`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...");
  await seedRoles();
  await seedPolicies();
  await seedUsers();
  await seedOs();
  await seedVm();
  await seedPackages();
  await seedIpPools();
  await seedPromotions();
  await seedSystemConfigs();
  await seedEmailTemplates();
  await seedTicketCategories();
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
