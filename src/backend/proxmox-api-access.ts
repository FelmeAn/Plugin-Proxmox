import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { ProxmoxError } from "./proxmox-shared.js";
import {
  isValidTokenId,
  isValidTokenSecret,
  parseProxmoxApiConfig,
  resolveProxmoxApiBaseUrl,
  type ProxmoxApiConfig,
} from "./proxmox/api-config.js";
import { createProxmoxApiClient } from "./proxmox/api-client.js";
import type { ProxmoxReader } from "./proxmox/reader.js";

/** Host setting holding transport, URL, token id and TLS options. */
export const API_CONFIG_KEY = "proxmoxApiConfig";
/** Host setting holding the token secret, encrypted at rest by core. */
export const API_TOKEN_SECRET_KEY = "proxmoxApiTokenSecret";

/** The host's connection settings, defaults filled in. */
export async function getProxmoxApiConfig(
  ctx: PluginContext,
  hostId: number,
): Promise<ProxmoxApiConfig> {
  return parseProxmoxApiConfig(
    await ctx.settings.getHost(hostId, API_CONFIG_KEY),
  );
}

/**
 * A reader for the host's Proxmox REST API, or null when the host uses SSH.
 *
 * The token belongs to the host's owner. With `ownerOnly`, a user the host
 * is shared with cannot make the plugin act with it; discovery and sync use
 * that, since their results become hosts the caller owns.
 */
export async function createApiReaderForHost(
  ctx: PluginContext,
  hostId: number,
  options: { ownerOnly?: boolean } = {},
): Promise<ProxmoxReader | null> {
  const config = await getProxmoxApiConfig(ctx, hostId);
  if (config.transport !== "api") return null;

  const host = await ctx.hosts.get(hostId);
  if (!host) {
    throw new ProxmoxError("Host not found", "API_NOT_CONFIGURED", 404);
  }
  if (options.ownerOnly && host.userId !== ctx.currentActor()) {
    throw new ProxmoxError(
      "Only the host's owner can use its Proxmox API token for this",
      "API_OWNER_ONLY",
      403,
    );
  }

  const tokenSecret = await ctx.settings.getHost<string>(
    hostId,
    API_TOKEN_SECRET_KEY,
  );
  if (!config.tokenId || !isValidTokenId(config.tokenId)) {
    throw new ProxmoxError(
      "Set an API token id in the form user@realm!tokenid",
      "API_NOT_CONFIGURED",
      422,
    );
  }
  if (typeof tokenSecret !== "string" || !isValidTokenSecret(tokenSecret)) {
    throw new ProxmoxError(
      "Set the API token secret",
      "API_NOT_CONFIGURED",
      422,
    );
  }

  return createProxmoxApiClient({
    fetch: ctx.fetch,
    baseUrl: resolveProxmoxApiBaseUrl(config),
    tokenId: config.tokenId,
    tokenSecret,
    tlsMode: config.tlsMode,
    caPem: config.caPem,
  });
}
