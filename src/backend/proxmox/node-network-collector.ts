import type { Client } from "ssh2";
import { execCommand } from "./common-utils.js";
import { isSafeNodeName } from "../proxmox-shared.js";
import type { ProxmoxReader } from "./reader.js";

interface ProxmoxNodeNetworkInterface {
  name: string;
  ip: string | null;
  state: string | null;
  rxBytes: string | null;
  txBytes: string | null;
}

export interface ProxmoxNodeNetworkResult {
  interfaces: ProxmoxNodeNetworkInterface[];
}

const EMPTY_RESULT: ProxmoxNodeNetworkResult = { interfaces: [] };

async function collectFromProcNetDev(
  client: Client,
): Promise<ProxmoxNodeNetworkResult> {
  const interfaces: ProxmoxNodeNetworkInterface[] = [];

  try {
    const [addrOut, stateOut, procNetOut] = await Promise.all([
      execCommand(
        client,
        "ip -o addr show | awk '{print $2,$4}' | grep -v '^lo'",
      ),
      execCommand(
        client,
        "ip -o link show | awk '{gsub(/:/, \"\", $2); print $2,$9}'",
      ),
      execCommand(client, "cat /proc/net/dev"),
    ]);

    const ifMap = new Map<
      string,
      { ip: string | null; state: string | null }
    >();
    for (const line of addrOut.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[0];
        const ip = parts[1].split("/")[0];
        if (!ifMap.has(name)) ifMap.set(name, { ip, state: null });
      }
    }
    for (const line of stateOut.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const existing = ifMap.get(parts[0]);
        if (existing) existing.state = parts[1];
      }
    }

    const rxTxMap = new Map<string, { rx: string; tx: string }>();
    for (const line of procNetOut.stdout.split("\n").slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 10) {
        const ifName = parts[0].replace(":", "");
        rxTxMap.set(ifName, { rx: parts[1], tx: parts[9] });
      }
    }

    for (const [name, data] of ifMap.entries()) {
      const rxTx = rxTxMap.get(name);
      interfaces.push({
        name,
        ip: data.ip,
        state: data.state,
        rxBytes: rxTx?.rx ?? null,
        txBytes: rxTx?.tx ?? null,
      });
    }
  } catch {
    return EMPTY_RESULT;
  }

  return { interfaces };
}

/** Per-guest devices Proxmox creates on the node: taps, veths and firewall bridges. */
const GUEST_INTERFACE = /^(tap|veth|fwbr|fwpr|fwln)/;

/**
 * The node's own network interfaces. pvesh's netstat lists each guest's
 * virtual NIC instead, so the node is read directly.
 */
export async function collectProxmoxNodeNetwork(
  client: Client,
  nodeName: string,
): Promise<ProxmoxNodeNetworkResult> {
  if (!isSafeNodeName(nodeName)) {
    return EMPTY_RESULT;
  }
  const { interfaces } = await collectFromProcNetDev(client);
  return {
    interfaces: interfaces.filter((iface) => !GUEST_INTERFACE.test(iface.name)),
  };
}

/**
 * The node's network interfaces over the REST API, from
 * /nodes/{node}/network. The API reports addresses and link state but no
 * traffic counters, so rxBytes and txBytes stay null in API mode.
 */
export async function readProxmoxNodeNetwork(
  read: ProxmoxReader,
  nodeName: string,
): Promise<ProxmoxNodeNetworkResult> {
  if (!isSafeNodeName(nodeName)) {
    return EMPTY_RESULT;
  }
  try {
    const data = await read(`/nodes/${nodeName}/network`, 15000);
    if (!Array.isArray(data)) return EMPTY_RESULT;
    const interfaces: ProxmoxNodeNetworkInterface[] = [];
    for (const entry of data as Array<Record<string, unknown>>) {
      const name = typeof entry.iface === "string" ? entry.iface : "";
      if (!name || name === "lo" || GUEST_INTERFACE.test(name)) continue;
      const cidr = typeof entry.cidr === "string" ? entry.cidr : null;
      const address =
        typeof entry.address === "string" && entry.address
          ? entry.address
          : (cidr?.split("/")[0] ?? null);
      interfaces.push({
        name,
        ip: address,
        state: entry.active === 1 || entry.active === true ? "UP" : "DOWN",
        rxBytes: null,
        txBytes: null,
      });
    }
    interfaces.sort((a, b) => a.name.localeCompare(b.name));
    return { interfaces };
  } catch {
    return EMPTY_RESULT;
  }
}
