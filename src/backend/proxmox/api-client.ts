import type { PluginFetchInit } from "@termix-ssh/plugin-sdk/backend";
import { ProxmoxError } from "../proxmox-shared.js";
import type { ProxmoxTlsMode } from "./api-config.js";
import type { ProxmoxReader } from "./reader.js";

/** ctx.fetch, or a stand-in with the same shape in tests. */
export type ProxmoxFetch = (
  url: string,
  init?: PluginFetchInit,
) => Promise<Response>;

export interface ProxmoxApiClientOptions {
  fetch: ProxmoxFetch;
  /** Origin only, as resolveProxmoxApiBaseUrl returns it. */
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  tlsMode: ProxmoxTlsMode;
  caPem?: string | null;
}

const DEFAULT_TIMEOUT_MS = 25000;

/** Node TLS error codes that mean the certificate check failed. */
const TLS_ERROR_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_UNTRUSTED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** The error codes along a fetch error's cause chain. */
function errorCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") codes.push(code);
    current = (current as { cause?: unknown }).cause;
  }
  return codes;
}

function tlsOptions(
  tlsMode: ProxmoxTlsMode,
  caPem: string | null | undefined,
): PluginFetchInit["tls"] {
  if (tlsMode === "insecure") return { rejectUnauthorized: false };
  if (tlsMode === "ca") {
    if (!caPem) {
      throw new ProxmoxError(
        "No CA certificate is set for the Proxmox API",
        "API_NOT_CONFIGURED",
        422,
      );
    }
    return { ca: caPem };
  }
  return undefined;
}

/**
 * A read-only client for the Proxmox VE REST API, authenticated with an API
 * token. Requests go through ctx.fetch, so core's outbound guard, audit and
 * proxy settings apply; the node's own address is the one private host it
 * may reach.
 */
export function createProxmoxApiClient(
  options: ProxmoxApiClientOptions,
): ProxmoxReader {
  const tls = tlsOptions(options.tlsMode, options.caPem);
  const hostname = new URL(options.baseUrl).hostname.replace(/^\[|\]$/g, "");
  const authorization = `PVEAPIToken=${options.tokenId}=${options.tokenSecret}`;

  return async (path, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    if (!path.startsWith("/") || path.includes("..") || /[?#\s]/.test(path)) {
      throw new ProxmoxError(
        `Refusing to request an unexpected API path: ${path}`,
        "API_REQUEST_FAILED",
      );
    }

    let response: Response;
    try {
      response = await options.fetch(`${options.baseUrl}/api2/json${path}`, {
        method: "GET",
        headers: { Authorization: authorization, Accept: "application/json" },
        timeoutMs,
        allowPrivateHosts: [hostname],
        ...(tls ? { tls } : {}),
      });
    } catch (error) {
      if (errorCodes(error).some((code) => TLS_ERROR_CODES.has(code))) {
        throw new ProxmoxError(
          "The Proxmox API certificate could not be verified",
          "API_TLS_FAILED",
          502,
        );
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new ProxmoxError(
        `The Proxmox API could not be reached: ${detail}`,
        "API_UNREACHABLE",
        502,
      );
    }

    if (response.status === 401) {
      throw new ProxmoxError(
        "The Proxmox API rejected the token",
        "API_AUTH_FAILED",
        422,
      );
    }
    if (response.status === 403) {
      throw new ProxmoxError(
        `The API token lacks the permission to read ${path}`,
        "API_FORBIDDEN",
        403,
      );
    }
    if (!response.ok) {
      throw new ProxmoxError(
        `The Proxmox API answered ${response.status} for ${path}`,
        "API_REQUEST_FAILED",
        502,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ProxmoxError(
        "The Proxmox API returned a response that could not be read",
        "API_BAD_RESPONSE",
        502,
      );
    }
    if (!body || typeof body !== "object" || !("data" in body)) {
      throw new ProxmoxError(
        "The Proxmox API returned a response that could not be read",
        "API_BAD_RESPONSE",
        502,
      );
    }
    return (body as { data: unknown }).data;
  };
}
