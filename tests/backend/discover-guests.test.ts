import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/backend/plugin-ctx.js", () => ({
  pluginCtx: () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }),
}));

import {
  discoverGuests,
  parseProxmoxConfig,
} from "../../src/backend/routes.js";

function reader(responses: Record<string, unknown>) {
  return vi.fn(async (path: string) => {
    if (!(path in responses)) throw new Error(`no answer for ${path}`);
    return responses[path];
  });
}

describe("discoverGuests", () => {
  const config = {
    ...parseProxmoxConfig({ preferredPrefixes: "10." }),
  };

  it("reads guests and their addresses through the reader", async () => {
    const read = reader({
      "/cluster/resources": [
        { type: "node", node: "pve1" },
        {
          type: "qemu",
          node: "pve1",
          vmid: 100,
          name: "win-dc",
          status: "running",
        },
        {
          type: "lxc",
          node: "pve1",
          vmid: 101,
          name: "docker-ct",
          status: "running",
        },
        { type: "qemu", node: "pve1", vmid: 9000, name: "tpl", template: 1 },
        {
          type: "qemu",
          node: "bad;node",
          vmid: 102,
          name: "x",
          status: "running",
        },
      ],
      "/nodes/pve1/qemu/100/agent/network-get-interfaces": {
        result: [
          {
            name: "lo",
            "ip-addresses": [
              { "ip-address-type": "ipv4", "ip-address": "127.0.0.1" },
            ],
          },
          {
            name: "eth0",
            "ip-addresses": [
              { "ip-address-type": "ipv4", "ip-address": "192.168.1.9" },
              { "ip-address-type": "ipv4", "ip-address": "10.0.0.9" },
            ],
          },
        ],
      },
      "/nodes/pve1/lxc/101/config": { net0: "name=eth0,bridge=vmbr0,ip=dhcp" },
      "/nodes/pve1/lxc/101/interfaces": [
        { name: "lo", inet: "127.0.0.1/8" },
        { name: "eth0", inet: "10.0.0.11/24" },
      ],
    });

    const guests = await discoverGuests(read, config, {
      concurrency: 2,
      badOutputCode: "API_BAD_RESPONSE",
    });

    expect(guests).toEqual([
      expect.objectContaining({
        vmid: 100,
        ip: "10.0.0.9",
        connectionType: "rdp",
        enableDocker: false,
      }),
      expect.objectContaining({
        vmid: 101,
        ip: "10.0.0.11",
        connectionType: "ssh",
        enableDocker: true,
      }),
    ]);
  });

  it("reports an unreadable guest list with the transport's code", async () => {
    const read = reader({ "/cluster/resources": { not: "a list" } });
    await expect(
      discoverGuests(read, config, {
        concurrency: 1,
        badOutputCode: "API_BAD_RESPONSE",
      }),
    ).rejects.toMatchObject({ code: "API_BAD_RESPONSE" });
  });
});
