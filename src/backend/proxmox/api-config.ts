import { ProxmoxError } from "../proxmox-shared.js";

/** How the plugin reaches a Proxmox node. */
export type ProxmoxTransport = "ssh" | "api";

/**
 * How the node's TLS certificate is checked in API mode.
 *
 * - system: the server's trust store, for a node with a publicly trusted cert
 * - ca: only the given PEM bundle, e.g. the cluster's /etc/pve/pve-root-ca.pem
 * - insecure: no check at all
 */
export type ProxmoxTlsMode = "system" | "ca" | "insecure";

export interface ProxmoxApiConfig {
  transport: ProxmoxTransport;
  /** https://host:8006 */
  baseUrl: string | null;
  /** user@realm!tokenid */
  tokenId: string | null;
  tlsMode: ProxmoxTlsMode;
  caPem: string | null;
}

/**
 * user@realm!tokenid. PVE allows a wide range of characters in user names,
 * so only the separators and whitespace are ruled out there; the token id
 * itself follows PVE's own pattern.
 */
const TOKEN_ID_PATTERN = /^[^\s@!:=]+@[^\s@!:=]+![A-Za-z][A-Za-z0-9._-]*$/;

/** PVE token secrets are UUIDs. */
const TOKEN_SECRET_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const DEFAULT_PROXMOX_API_CONFIG: ProxmoxApiConfig = {
  transport: "ssh",
  baseUrl: null,
  tokenId: null,
  tlsMode: "ca",
  caPem: null,
};

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Reads the stored proxmoxApiConfig, filling in defaults for anything missing or invalid. */
export function parseProxmoxApiConfig(raw: unknown): ProxmoxApiConfig {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PROXMOX_API_CONFIG };
  }
  const cfg = value as Record<string, unknown>;
  const tlsMode =
    cfg.tlsMode === "system" ||
    cfg.tlsMode === "ca" ||
    cfg.tlsMode === "insecure"
      ? cfg.tlsMode
      : DEFAULT_PROXMOX_API_CONFIG.tlsMode;
  return {
    transport: cfg.transport === "api" ? "api" : "ssh",
    baseUrl: trimmedOrNull(cfg.baseUrl),
    tokenId: trimmedOrNull(cfg.tokenId),
    tlsMode,
    caPem: trimmedOrNull(cfg.caPem),
  };
}

export function isValidTokenId(tokenId: string): boolean {
  return TOKEN_ID_PATTERN.test(tokenId);
}

export function isValidTokenSecret(secret: string): boolean {
  return TOKEN_SECRET_PATTERN.test(secret);
}

/**
 * The API origin to call, reduced from the configured URL. Only https is
 * accepted, since the token travels in a header on every request.
 *
 * The URL is required rather than derived from the host's address: someone
 * the host is shared with for editing can change that address, while this
 * setting is owner-only, so the token can never be steered elsewhere.
 */
export function resolveProxmoxApiBaseUrl(
  config: Pick<ProxmoxApiConfig, "baseUrl">,
): string {
  if (!config.baseUrl) {
    throw new ProxmoxError(
      "Set the Proxmox API URL",
      "API_NOT_CONFIGURED",
      422,
    );
  }
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new ProxmoxError(
      "The Proxmox API URL is not valid",
      "API_NOT_CONFIGURED",
      422,
    );
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new ProxmoxError(
      "The Proxmox API URL must use https and carry no credentials",
      "API_NOT_CONFIGURED",
      422,
    );
  }
  return url.origin;
}
