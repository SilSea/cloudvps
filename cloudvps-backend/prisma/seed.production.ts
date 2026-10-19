import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/hash";
import { DEFAULT_TEMPLATES } from "../src/services/email-template.service";

const prisma = new PrismaClient();

async function seedRoles() {
  for (const name of ["admin", "support", "users"] as const) {
    const exists = await prisma.roles.findFirst({ where: { role_name: name } });
    if (!exists) {
      await prisma.roles.create({ data: { role_name: name, status: true } });
      console.log(`  [roles] created: ${name}`);
    } else {
      console.log(`  [roles] exists:  ${name}`);
    }
  }
}

async function seedAdminUser() {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("ERROR: ADMIN_EMAIL and ADMIN_PASSWORD env vars are required.");
    console.error("  Example: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SecurePass123! bun run db:seed:prod");
    process.exit(1);
  }

  const exists = await prisma.users.findUnique({ where: { email } });
  if (exists) {
    console.log(`  [admin] already exists: ${email}`);
    return;
  }

  const role = await prisma.roles.findFirst({ where: { role_name: "admin" } });
  if (!role) {
    console.error("ERROR: admin role not found — run seedRoles first.");
    process.exit(1);
  }

  const hashed = await hashPassword(password);
  await prisma.users.create({
    data: {
      email,
      password: hashed,
      role_id: role.id,
      status: true,
      is_verify: true,
      users_info: {
        create: {
          first_name: "Admin",
          last_name:  "CloudVPS",
          phone:      "0000000000",
          address1:   "-",
          address3:   "-",
          address4:   "-",
          address5:   "00000",
          address6:   "Thailand",
        },
      },
    },
  });

  console.log(`  [admin] created: ${email}`);
}

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
    } else {
      console.log(`  [policies] exists:  ${p.policies_type} v${p.version}`);
    }
  }
}

async function seedSystemConfigs() {
  const configs = [
    // Proxmox VE — connection
    { key: "proxmox.host",            category: "proxmox",  is_secret: false, description: "Proxmox VE host/IP (e.g. 10.0.0.1)" },
    { key: "proxmox.token_id",        category: "proxmox",  is_secret: false, description: "Proxmox API token ID (user@realm!tokenname)" },
    { key: "proxmox.token_secret",    category: "proxmox",  is_secret: true,  description: "Proxmox API token secret UUID" },
    { key: "proxmox.node",            category: "proxmox",  is_secret: false, description: "Proxmox node name (e.g. pve)" },
    // Proxmox VE — provisioning
    { key: "proxmox.storage",         category: "proxmox",  is_secret: false, description: "Storage pool for VM disks (e.g. local-lvm)" },
    { key: "proxmox.bridge",          category: "proxmox",  is_secret: false, description: "Network bridge (e.g. vmbr0)" },
    { key: "proxmox.gateway_public",  category: "proxmox",  is_secret: false, description: "Default gateway for PUBLIC IPs" },
    { key: "proxmox.gateway_private", category: "proxmox",  is_secret: false, description: "Default gateway for PRIVATE IPs" },
    { key: "proxmox.subnet",          category: "proxmox",  is_secret: false, description: "Subnet prefix length (e.g. 24)" },
    { key: "proxmox.default_user",    category: "proxmox",  is_secret: false, description: "cloud-init default OS user (e.g. ubuntu)" },
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
    // Capacity lock (Phase 14)
    { key: "capacity.check_enabled",   category: "capacity", is_secret: false, description: "Enable resource capacity check before order creation (true/false, default true)" },
    { key: "capacity.min_free_ram_mb", category: "capacity", is_secret: false, description: "Minimum free RAM MB to keep reserved after allocation (default 1024)" },
    { key: "capacity.min_free_disk_gb",category: "capacity", is_secret: false, description: "Minimum free disk GB to keep reserved after allocation (default 10)" },
    // Payment — slip upload mode (Phase 15)
    { key: "payment.slip_mode",        category: "payment",  is_secret: false, description: "Slip upload mode: FILE (multipart disk, default) | BASE64 (raw base64 string)" },
  ];

  for (const c of configs) {
    const exists = await prisma.system_configs.findUnique({ where: { key: c.key } });
    if (!exists) {
      await prisma.system_configs.create({ data: { ...c, value: null } });
      console.log(`  [syscfg] created: ${c.key}`);
    } else {
      console.log(`  [syscfg] exists:  ${c.key}`);
    }
  }
}

async function seedEmailTemplates() {
  for (const [type, tpl] of Object.entries(DEFAULT_TEMPLATES) as [any, any][]) {
    const exists = await prisma.email_templates.findUnique({ where: { type } });
    if (!exists) {
      await prisma.email_templates.create({
        data: { type, subject: tpl.subject, body_html: tpl.body_html, is_active: true },
      });
      console.log(`  [email_templates] created: ${type}`);
    } else {
      console.log(`  [email_templates] exists:  ${type}`);
    }
  }
}

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
    } else {
      console.log(`  [ticket_categories] exists:  ${c.name}`);
    }
  }
}


async function main() {
  console.log("Production seed starting...");
  await seedRoles();
  await seedPolicies();
  await seedSystemConfigs();
  await seedEmailTemplates();
  await seedTicketCategories();
  await seedAdminUser();
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
