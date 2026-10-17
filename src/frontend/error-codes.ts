const KEYS: Record<string, string> = {
  PVESH_NOT_FOUND: "proxmoxStats.pveshNotFound",
  PVESH_BAD_OUTPUT: "proxmoxStats.pveshBadOutput",
  NODE_NAME_INVALID: "proxmoxStats.nodeDetectionFailed",
  API_NOT_CONFIGURED: "proxmoxStats.apiNotConfigured",
  API_AUTH_FAILED: "proxmoxStats.apiAuthFailed",
  API_FORBIDDEN: "proxmoxStats.apiForbidden",
  API_TLS_FAILED: "proxmoxStats.apiTlsFailed",
  API_UNREACHABLE: "proxmoxStats.apiUnreachable",
  API_REQUEST_FAILED: "proxmoxStats.apiRequestFailed",
  API_BAD_RESPONSE: "proxmoxStats.apiBadResponse",
  API_OWNER_ONLY: "proxmoxStats.apiOwnerOnly",
};

/** The translated text for a backend error code, or the fallback. */
export function proxmoxErrorText(
  t: (key: string) => string,
  code: string | undefined,
  fallback: string,
): string {
  const key = code ? KEYS[code] : undefined;
  return key ? t(key) : fallback;
}
