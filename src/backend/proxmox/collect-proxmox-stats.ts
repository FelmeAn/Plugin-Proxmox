import type { Client } from "ssh2";
import { execCommand } from "./common-utils.js";
import { createPveshRunner } from "./pvesh-runner.js";
import { ProxmoxError, isSafeNodeName } from "../proxmox-shared.js";
import type { ProxmoxReader } from "./reader.js";
import {
  collectProxmoxNodeStatus,
  readProxmoxNodeStatus,
  type ProxmoxNodeStatusResult,
} from "./node-status-collector.js";
import {
  collectProxmoxNodeNetwork,
  readProxmoxNodeNetwork,
  type ProxmoxNodeNetworkResult,
} from "./node-network-collector.js";
import {
  collectProxmoxGuestsSummary,
  readProxmoxGuestsSummary,
  type ProxmoxGuestsSummaryResult,
} from "./guests-collector.js";
import {
  collectProxmoxStorage,
  readProxmoxStorage,
  type ProxmoxStorageResult,
} from "./storage-collector.js";
import {
  collectProxmoxClusterHealth,
  readProxmoxClusterHealth,
  type ProxmoxClusterHealthResult,
} from "./cluster-health-collector.js";

export interface ProxmoxStatsSnapshot {
  node: ProxmoxNodeStatusResult;
  network: ProxmoxNodeNetworkResult;
  guests: ProxmoxGuestsSummaryResult;
  storage: ProxmoxStorageResult;
  cluster: ProxmoxClusterHealthResult;
  lastChecked: string;
}

async function resolveNodeName(
  client: Client,
  configuredNodeName: string | null | undefined,
): Promise<string> {
  if (configuredNodeName) {
    // An explicitly configured name is validated and used as-is - an unsafe
    // value is rejected outright rather than silently falling back to
    // auto-detection, which would mask a misconfigured (or malicious) override.
    if (!isSafeNodeName(configuredNodeName)) {
      throw new ProxmoxError(
        "Unable to determine a valid Proxmox node name",
        "NODE_NAME_INVALID",
      );
    }
    return configuredNodeName;
  }

  const { stdout } = await execCommand(client, "hostname", 10000);
  return stdout.trim();
}

export async function collectProxmoxStats(
  client: Client,
  configuredNodeName: string | null | undefined,
  sudoPassword?: string,
): Promise<ProxmoxStatsSnapshot> {
  const pveshCheck = await execCommand(
    client,
    "command -v pvesh >/dev/null 2>&1 && echo ok || echo missing",
    10000,
  );
  if (pveshCheck.stdout.trim() !== "ok") {
    throw new ProxmoxError(
      "pvesh was not found. Is this a Proxmox node?",
      "PVESH_NOT_FOUND",
    );
  }

  const nodeName = await resolveNodeName(client, configuredNodeName);
  if (!isSafeNodeName(nodeName)) {
    throw new ProxmoxError(
      "Unable to determine a valid Proxmox node name",
      "NODE_NAME_INVALID",
    );
  }

  const run = createPveshRunner(client, sudoPassword);
  const [node, network, guests, storage, cluster] = await Promise.all([
    collectProxmoxNodeStatus(client, nodeName, run),
    collectProxmoxNodeNetwork(client, nodeName),
    collectProxmoxGuestsSummary(client, nodeName, run),
    collectProxmoxStorage(client, nodeName, run),
    collectProxmoxClusterHealth(client, run),
  ]);

  return {
    node,
    network,
    guests,
    storage,
    cluster,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * The node an API request lands on. /cluster/status flags the answering node
 * as local; a standalone node that lists no cluster entries is the only one
 * in /nodes.
 */
export async function detectApiNodeName(read: ProxmoxReader): Promise<string> {
  const status = await read("/cluster/status", 15000);
  if (Array.isArray(status)) {
    const local = (status as Array<Record<string, unknown>>).find(
      (entry) =>
        entry.type === "node" && (entry.local === 1 || entry.local === true),
    );
    if (typeof local?.name === "string" && local.name) return local.name;
  }
  const nodes = await read("/nodes", 15000);
  if (Array.isArray(nodes) && nodes.length === 1) {
    const only = (nodes[0] as Record<string, unknown>).node;
    if (typeof only === "string" && only) return only;
  }
  throw new ProxmoxError(
    "Could not tell which Proxmox node the API URL points at; set the node name",
    "NODE_NAME_INVALID",
  );
}

/**
 * The same snapshot as collectProxmoxStats, read over the REST API. A first
 * call to /version fails loudly on a bad token, URL or certificate, where the
 * collectors below would quietly return empty shapes.
 */
export async function collectProxmoxStatsFromApi(
  read: ProxmoxReader,
  configuredNodeName: string | null | undefined,
): Promise<ProxmoxStatsSnapshot> {
  await read("/version", 10000);

  if (configuredNodeName && !isSafeNodeName(configuredNodeName)) {
    throw new ProxmoxError(
      "Unable to determine a valid Proxmox node name",
      "NODE_NAME_INVALID",
    );
  }
  const nodeName = configuredNodeName || (await detectApiNodeName(read));
  if (!isSafeNodeName(nodeName)) {
    throw new ProxmoxError(
      "Unable to determine a valid Proxmox node name",
      "NODE_NAME_INVALID",
    );
  }

  const [node, network, guests, storage, cluster] = await Promise.all([
    readProxmoxNodeStatus(read, nodeName),
    readProxmoxNodeNetwork(read, nodeName),
    readProxmoxGuestsSummary(read, nodeName),
    readProxmoxStorage(read, nodeName),
    readProxmoxClusterHealth(read),
  ]);

  return {
    node,
    network,
    guests,
    storage,
    cluster,
    lastChecked: new Date().toISOString(),
  };
}
