import { describe, expect, it, vi } from "vitest";
import {
  collectProxmoxStatsFromApi,
  detectApiNodeName,
} from "../../../src/backend/proxmox/collect-proxmox-stats.js";
import { readProxmoxNodeNetwork } from "../../../src/backend/proxmox/node-network-collector.js";
import type { ProxmoxReader } from "../../../src/backend/proxmox/reader.js";

function reader(responses: Record<string, unknown>) {
  return vi.fn(async (path: string) => {
    if (!(path in responses)) throw new Error(`unexpected path ${path}`);
    const value = responses[path];
    if (value instanceof Error) throw value;
    return value;
  }) satisfies ProxmoxReader;
}

describe("detectApiNodeName", () => {
  it("takes the local node from /cluster/status", async () => {
    const read = reader({
      "/cluster/status": [
        { type: "cluster", name: "c1", quorate: 1 },
        { type: "node", name: "pve1", local: 0 },
        { type: "node", name: "pve2", local: 1 },
      ],
    });
    await expect(detectApiNodeName(read)).resolves.toBe("pve2");
  });

  it("falls back to the only entry in /nodes", async () => {
    const read = reader({
      "/cluster/status": [],
      "/nodes": [{ node: "solo" }],
    });
    await expect(detectApiNodeName(read)).resolves.toBe("solo");
  });

  it("asks for a node name when it cannot tell", async () => {
    const read = reader({
      "/cluster/status": [],
      "/nodes": [{ node: "a" }, { node: "b" }],
    });
    await expect(detectApiNodeName(read)).rejects.toMatchObject({
      code: "NODE_NAME_INVALID",
    });
  });
});

describe("collectProxmoxStatsFromApi", () => {
  it("fails loudly when the first API call fails", async () => {
    const { ProxmoxError } =
      await import("../../../src/backend/proxmox-shared.js");
    const read = reader({
      "/version": new ProxmoxError("bad token", "API_AUTH_FAILED"),
    });
    await expect(
      collectProxmoxStatsFromApi(read, "pve1"),
    ).rejects.toMatchObject({ code: "API_AUTH_FAILED" });
  });

  it("builds a snapshot for the configured node", async () => {
    const read = reader({
      "/version": { version: "8.2.4" },
      "/nodes/pve1/status": {
        cpu: 0.5,
        cpuinfo: { cores: 4 },
        memory: { used: 2, total: 4 },
        rootfs: { used: 1, total: 4 },
        uptime: 60,
        pveversion: "pve-manager/8.2.4",
      },
      "/nodes/pve1/network": [
        { iface: "vmbr0", active: 1, cidr: "10.0.0.5/24" },
        { iface: "tap100i0", active: 1 },
        { iface: "eno2", active: 0 },
      ],
      "/cluster/resources": [
        {
          type: "qemu",
          node: "pve1",
          vmid: 100,
          name: "vm",
          status: "running",
        },
        { type: "lxc", node: "pve2", vmid: 101, name: "ct", status: "running" },
      ],
      "/nodes/pve1/storage": [
        {
          storage: "local",
          type: "dir",
          active: 1,
          enabled: 1,
          used: 1,
          total: 2,
        },
      ],
      "/cluster/status": [{ type: "node", name: "pve1", local: 1 }],
    });

    const snapshot = await collectProxmoxStatsFromApi(read, "pve1");
    expect(snapshot.node.cpu.percent).toBe(50);
    expect(snapshot.node.system.pveVersion).toBe("pve-manager/8.2.4");
    expect(snapshot.network.interfaces).toEqual([
      { name: "eno2", ip: null, state: "DOWN", rxBytes: null, txBytes: null },
      {
        name: "vmbr0",
        ip: "10.0.0.5",
        state: "UP",
        rxBytes: null,
        txBytes: null,
      },
    ]);
    expect(snapshot.guests.counts.total).toBe(1);
    expect(snapshot.storage.pools[0].percent).toBe(50);
    expect(snapshot.cluster).toEqual({ clustered: false });
  });

  it("rejects an unsafe configured node name before any node call", async () => {
    const read = reader({ "/version": {} });
    await expect(
      collectProxmoxStatsFromApi(read, "bad;node"),
    ).rejects.toMatchObject({ code: "NODE_NAME_INVALID" });
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("readProxmoxNodeNetwork", () => {
  it("returns an empty list when the call fails", async () => {
    const read = reader({ "/nodes/pve1/network": new Error("403") });
    await expect(readProxmoxNodeNetwork(read, "pve1")).resolves.toEqual({
      interfaces: [],
    });
  });
});
