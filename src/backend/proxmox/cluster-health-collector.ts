import type { Client } from "ssh2";
import { directRunner, type PveshRunner } from "./pvesh-runner.js";
import { pveshReader, type ProxmoxReader } from "./reader.js";

interface ProxmoxClusterNodeEntry {
  name: string;
  online: boolean;
  local: boolean;
  ip: string | null;
}

export type ProxmoxClusterHealthResult =
  | { clustered: false }
  | {
      clustered: true;
      quorate: boolean;
      clusterName: string | null;
      nodes: ProxmoxClusterNodeEntry[];
    };

const EMPTY_RESULT: ProxmoxClusterHealthResult = { clustered: false };

export async function collectProxmoxClusterHealth(
  client: Client,
  run: PveshRunner = directRunner(client),
): Promise<ProxmoxClusterHealthResult> {
  return readProxmoxClusterHealth(pveshReader(run));
}

/** /cluster/status, read over either transport. */
export async function readProxmoxClusterHealth(
  read: ProxmoxReader,
): Promise<ProxmoxClusterHealthResult> {
  try {
    const data = await read("/cluster/status", 15000);
    if (!Array.isArray(data)) {
      return EMPTY_RESULT;
    }

    const entries = data as Array<Record<string, unknown>>;
    const clusterEntry = entries.find((e) => e.type === "cluster");
    if (!clusterEntry) {
      return EMPTY_RESULT;
    }

    const nodes: ProxmoxClusterNodeEntry[] = entries
      .filter((e) => e.type === "node")
      .map((e) => ({
        name: typeof e.name === "string" ? e.name : "",
        online: e.online === 1 || e.online === true,
        local: e.local === 1 || e.local === true,
        ip: typeof e.ip === "string" && e.ip ? e.ip : null,
      }));

    return {
      clustered: true,
      quorate: clusterEntry.quorate === 1 || clusterEntry.quorate === true,
      clusterName:
        typeof clusterEntry.name === "string" && clusterEntry.name
          ? clusterEntry.name
          : null,
      nodes,
    };
  } catch {
    return EMPTY_RESULT;
  }
}
