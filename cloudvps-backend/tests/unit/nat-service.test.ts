import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mutable mock state ─────────────────────────────────────────────────────────

let _natAlloc: any = null;
let _createAlloc: any = null;
let _createRule: any = null;
let _findRule: any = null;
let _systemConfigValues: Record<string, string | null> = {};

const prismaMock = {
  nat_allocations: {
    findFirst: mock(async () => null),
    findUnique: mock(async () => _natAlloc),
    create: mock(async () => _createAlloc),
    update: mock(async () => {}),
  },
  nat_port_rules: {
    create: mock(async () => _createRule),
    findUnique: mock(async () => _findRule),
    update: mock(async () => {}),
    updateMany: mock(async () => {}),
  },
  $transaction: mock(async (ops: any) => {
    if (Array.isArray(ops)) {
      for (const op of ops) await op;
    } else {
      return ops(prismaMock);
    }
  }),
};

const mikrotikMock = {
  createNatRule: mock(async () => "mikrotik-id-1"),
  deleteNatRule: mock(async () => {}),
};

mock.module("../../src/config/database", () => ({ prisma: prismaMock }));
mock.module("../../src/services/mikrotik.service", () => ({ mikrotikService: mikrotikMock }));
mock.module("../../src/services/system-config.service", () => ({
  systemConfigService: {
    get: mock(async (key: string) => _systemConfigValues[key] ?? null),
  },
}));

const { natService } = await import("../../src/services/nat.service");

function resetMocks() {
  _natAlloc = null;
  _createAlloc = null;
  _createRule = null;
  _findRule = null;
  _systemConfigValues = {};
  prismaMock.nat_allocations.findFirst.mockClear();
  prismaMock.nat_allocations.findUnique.mockClear();
  prismaMock.nat_allocations.create.mockClear();
  prismaMock.nat_allocations.update.mockClear();
  prismaMock.nat_port_rules.create.mockClear();
  prismaMock.nat_port_rules.findUnique.mockClear();
  prismaMock.nat_port_rules.update.mockClear();
  prismaMock.nat_port_rules.updateMany.mockClear();
  prismaMock.$transaction.mockClear();
  mikrotikMock.createNatRule.mockClear();
  mikrotikMock.deleteNatRule.mockClear();
}

// ── allocateBlock() ────────────────────────────────────────────────────────────

describe("natService.allocateBlock()", () => {
  beforeEach(resetMocks);

  it("NAT-U-1: returns early when nat_public_ip not configured", async () => {
    _systemConfigValues = { "mikrotik.nat_public_ip": null };
    await natService.allocateBlock({ vpsId: 1, portCount: 10, privateIp: "172.16.1.1", osName: "Ubuntu" });
    expect(prismaMock.nat_allocations.create).not.toHaveBeenCalled();
  });

  it("NAT-U-2: allocates from base port when no prior allocations", async () => {
    _systemConfigValues = { "mikrotik.nat_public_ip": "1.2.3.4", "mikrotik.nat_base_port": "20000" };
    _createAlloc = { id: 1, vps_id: 1, public_ip: "1.2.3.4", port_start: 20000, port_end: 20009 };
    _createRule = { id: 1 };
    prismaMock.nat_allocations.findFirst = mock(async () => null);

    await natService.allocateBlock({ vpsId: 1, portCount: 10, privateIp: "172.16.1.1", osName: "Ubuntu" });

    const allocCall = prismaMock.nat_allocations.create.mock.calls[0][0];
    expect(allocCall.data.port_start).toBe(20000);
    expect(allocCall.data.port_end).toBe(20009);
  });

  it("NAT-U-3: allocates consecutive after last used block", async () => {
    _systemConfigValues = { "mikrotik.nat_public_ip": "1.2.3.4", "mikrotik.nat_base_port": "20000" };
    prismaMock.nat_allocations.findFirst = mock(async () => ({ port_end: 20049 }));
    _createAlloc = { id: 2, vps_id: 2, public_ip: "1.2.3.4", port_start: 20050, port_end: 20059 };
    _createRule = { id: 1 };

    await natService.allocateBlock({ vpsId: 2, portCount: 10, privateIp: "172.16.1.2", osName: "Ubuntu" });

    const allocCall = prismaMock.nat_allocations.create.mock.calls[0][0];
    expect(allocCall.data.port_start).toBe(20050);
    expect(allocCall.data.port_end).toBe(20059);
  });

  it("NAT-U-4: creates system rule on port_start (SSH for Linux)", async () => {
    _systemConfigValues = { "mikrotik.nat_public_ip": "1.2.3.4", "mikrotik.nat_base_port": "20000" };
    prismaMock.nat_allocations.findFirst = mock(async () => null);
    _createAlloc = { id: 1, vps_id: 1, public_ip: "1.2.3.4", port_start: 20000, port_end: 20009 };
    _createRule = { id: 1 };

    await natService.allocateBlock({ vpsId: 1, portCount: 10, privateIp: "172.16.1.1", osName: "Ubuntu 22.04" });

    expect(mikrotikMock.createNatRule).toHaveBeenCalledTimes(1);
    const callArgs = mikrotikMock.createNatRule.mock.calls[0][0];
    expect(callArgs.privatePort).toBe(22);
    expect(callArgs.publicPort).toBe(20000);
  });

  it("NAT-U-5: uses RDP port 3389 for Windows", async () => {
    _systemConfigValues = { "mikrotik.nat_public_ip": "1.2.3.4", "mikrotik.nat_base_port": "20000" };
    prismaMock.nat_allocations.findFirst = mock(async () => null);
    _createAlloc = { id: 1, vps_id: 1, public_ip: "1.2.3.4", port_start: 20000, port_end: 20009 };
    _createRule = { id: 1 };

    await natService.allocateBlock({ vpsId: 1, portCount: 10, privateIp: "172.16.1.1", osName: "Windows Server 2022" });

    const callArgs = mikrotikMock.createNatRule.mock.calls[0][0];
    expect(callArgs.privatePort).toBe(3389);
  });

  it("NAT-U-6: persists system rule with is_system=true even if MikroTik fails", async () => {
    _systemConfigValues = { "mikrotik.nat_public_ip": "1.2.3.4", "mikrotik.nat_base_port": "20000" };
    prismaMock.nat_allocations.findFirst = mock(async () => null);
    _createAlloc = { id: 1, vps_id: 1, public_ip: "1.2.3.4", port_start: 20000, port_end: 20009 };
    _createRule = { id: 1 };
    mikrotikMock.createNatRule = mock(async () => { throw new Error("MikroTik unreachable"); });

    await natService.allocateBlock({ vpsId: 1, portCount: 10, privateIp: "172.16.1.1", osName: "Ubuntu" });

    expect(prismaMock.nat_port_rules.create).toHaveBeenCalledTimes(1);
    const ruleCall = prismaMock.nat_port_rules.create.mock.calls[0][0];
    expect(ruleCall.data.is_system).toBe(true);
    expect(ruleCall.data.mikrotik_ids).toEqual([]);
  });
});

// ── addRule() ──────────────────────────────────────────────────────────────────

describe("natService.addRule()", () => {
  beforeEach(resetMocks);

  it("NAT-U-7: returns NAT_NOT_FOUND when no allocation", async () => {
    _natAlloc = null;
    const result = await natService.addRule({ vpsId: 99, privateIp: "172.16.1.1", privatePort: 80, protocol: "TCP" });
    expect(result).toEqual({ error: "NAT_NOT_FOUND" });
  });

  it("NAT-U-8: returns NAT_NOT_FOUND when allocation is inactive", async () => {
    _natAlloc = { id: 1, vps_id: 1, is_active: false, port_start: 20000, port_end: 20009, port_rules: [] };
    const result = await natService.addRule({ vpsId: 1, privateIp: "172.16.1.1", privatePort: 80, protocol: "TCP" });
    expect(result).toEqual({ error: "NAT_NOT_FOUND" });
  });

  it("NAT-U-9: returns PORT_LIMIT_REACHED when all ports used", async () => {
    _natAlloc = {
      id: 1, vps_id: 1, is_active: true, public_ip: "1.2.3.4",
      port_start: 20000, port_end: 20001,
      port_rules: [{ public_port: 20000 }, { public_port: 20001 }],
    };
    const result = await natService.addRule({ vpsId: 1, privateIp: "172.16.1.1", privatePort: 80, protocol: "TCP" });
    expect(result).toEqual({ error: "PORT_LIMIT_REACHED" });
  });

  it("NAT-U-10: allocates next free port and creates rule", async () => {
    _natAlloc = {
      id: 1, vps_id: 1, is_active: true, public_ip: "1.2.3.4",
      port_start: 20000, port_end: 20002,
      port_rules: [{ public_port: 20000 }],
    };
    _createRule = { id: 5, public_port: 20001, private_port: 80, protocol: "TCP", is_system: false };

    const result = await natService.addRule({ vpsId: 1, privateIp: "172.16.1.1", privatePort: 80, protocol: "TCP" });

    expect(result.error).toBeUndefined();
    const ruleCall = prismaMock.nat_port_rules.create.mock.calls[0][0];
    expect(ruleCall.data.public_port).toBe(20001);
  });

  it("NAT-U-11: BOTH protocol calls MikroTik twice (tcp + udp)", async () => {
    _natAlloc = {
      id: 1, vps_id: 1, is_active: true, public_ip: "1.2.3.4",
      port_start: 20000, port_end: 20009,
      port_rules: [],
    };
    _createRule = { id: 2 };

    await natService.addRule({ vpsId: 1, privateIp: "172.16.1.1", privatePort: 443, protocol: "BOTH" });

    expect(mikrotikMock.createNatRule).toHaveBeenCalledTimes(2);
    const protos = mikrotikMock.createNatRule.mock.calls.map((c: any) => c[0].protocol);
    expect(protos).toContain("tcp");
    expect(protos).toContain("udp");
  });

  it("NAT-U-12: MikroTik failure still creates DB rule with empty mikrotik_ids", async () => {
    _natAlloc = {
      id: 1, vps_id: 1, is_active: true, public_ip: "1.2.3.4",
      port_start: 20000, port_end: 20009,
      port_rules: [],
    };
    _createRule = { id: 3 };
    mikrotikMock.createNatRule = mock(async () => { throw new Error("timeout"); });

    const result = await natService.addRule({ vpsId: 1, privateIp: "172.16.1.1", privatePort: 8080, protocol: "TCP" });

    expect(result.error).toBeUndefined();
    const ruleCall = prismaMock.nat_port_rules.create.mock.calls[0][0];
    expect(ruleCall.data.mikrotik_ids).toEqual([]);
  });
});

// ── deleteRule() ───────────────────────────────────────────────────────────────

describe("natService.deleteRule()", () => {
  beforeEach(resetMocks);

  it("NAT-U-13: returns NOT_FOUND when rule missing", async () => {
    _findRule = null;
    const result = await natService.deleteRule({ ruleId: 999, vpsId: 1, userId: 1, role: "users" });
    expect(result).toEqual({ error: "NOT_FOUND" });
  });

  it("NAT-U-14: returns NOT_FOUND when rule is inactive", async () => {
    _findRule = {
      id: 1, is_active: false, is_system: false, mikrotik_ids: [],
      allocation: { vps_id: 1, vps: { order: { users_id: 5 } } },
    };
    const result = await natService.deleteRule({ ruleId: 1, vpsId: 1, userId: 5, role: "users" });
    expect(result).toEqual({ error: "NOT_FOUND" });
  });

  it("NAT-U-15: returns SYSTEM_RULE when non-admin tries to delete system rule", async () => {
    _findRule = {
      id: 1, is_active: true, is_system: true, mikrotik_ids: [],
      allocation: { vps_id: 1, vps: { order: { users_id: 5 } } },
    };
    const result = await natService.deleteRule({ ruleId: 1, vpsId: 1, userId: 5, role: "users" });
    expect(result).toEqual({ error: "SYSTEM_RULE" });
  });

  it("NAT-U-16: admin can delete system rule", async () => {
    _findRule = {
      id: 1, is_active: true, is_system: true, mikrotik_ids: ["mt-id-1"],
      allocation: { vps_id: 1, vps: { order: { users_id: 5 } } },
    };
    const result = await natService.deleteRule({ ruleId: 1, vpsId: 1, userId: 99, role: "admin" });
    expect(result).toEqual({});
    expect(mikrotikMock.deleteNatRule).toHaveBeenCalledWith("mt-id-1");
  });

  it("NAT-U-17: returns FORBIDDEN when user tries to delete another user's rule", async () => {
    _findRule = {
      id: 1, is_active: true, is_system: false, mikrotik_ids: [],
      allocation: { vps_id: 1, vps: { order: { users_id: 5 } } },
    };
    const result = await natService.deleteRule({ ruleId: 1, vpsId: 1, userId: 99, role: "users" });
    expect(result).toEqual({ error: "FORBIDDEN" });
  });

  it("NAT-U-18: marks rule inactive on successful delete", async () => {
    _findRule = {
      id: 10, is_active: true, is_system: false, mikrotik_ids: [],
      allocation: { vps_id: 1, vps: { order: { users_id: 5 } } },
    };
    await natService.deleteRule({ ruleId: 10, vpsId: 1, userId: 5, role: "users" });
    expect(prismaMock.nat_port_rules.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { is_active: false },
    });
  });
});

// ── getInfo() ──────────────────────────────────────────────────────────────────

describe("natService.getInfo()", () => {
  beforeEach(resetMocks);

  it("NAT-U-19: returns null when no active allocation", async () => {
    _natAlloc = null;
    const result = await natService.getInfo(1);
    expect(result).toBeNull();
  });

  it("NAT-U-20: returns null when allocation is inactive", async () => {
    _natAlloc = { id: 1, is_active: false, port_rules: [] };
    const result = await natService.getInfo(1);
    expect(result).toBeNull();
  });

  it("NAT-U-21: returns nat_allocation summary with correct counts", async () => {
    _natAlloc = {
      id: 1, is_active: true, public_ip: "1.2.3.4", port_start: 20000, port_end: 20009,
      port_rules: [
        { id: 1, public_port: 20000, private_port: 22, protocol: "TCP", is_system: true },
        { id: 2, public_port: 20001, private_port: 8080, protocol: "TCP", is_system: false },
      ],
    };
    const result = await natService.getInfo(1);
    expect(result?.nat_allocation.used_count).toBe(2);
    expect(result?.nat_allocation.available_count).toBe(8);
    expect(result?.port_rules).toHaveLength(2);
  });
});
