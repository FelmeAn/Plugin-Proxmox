import type { PveshRunner } from "./pvesh-runner.js";

/**
 * Reads one Proxmox API path and returns its `data`, or throws.
 *
 * The same paths answer over SSH (pvesh) and over HTTPS (the REST API), so
 * the collectors and discovery read through this and stay transport-agnostic.
 */
export type ProxmoxReader = (
  path: string,
  timeoutMs?: number,
) => Promise<unknown>;

const DEFAULT_TIMEOUT_MS = 25000;

/** A reader that runs `pvesh get <path>` over an SSH connection. */
export function pveshReader(run: PveshRunner): ProxmoxReader {
  return async (path, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const { stdout, code } = await run(
      `pvesh get ${path} --output-format json`,
      timeoutMs,
    );
    if (code !== 0) {
      throw new Error(`pvesh get ${path} exited with code ${code}`);
    }
    return JSON.parse(stdout) as unknown;
  };
}
