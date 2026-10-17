import { describe, expect, it, vi } from "vitest";
import type { PluginFetchInit } from "@termix-ssh/plugin-sdk/backend";
import { createProxmoxApiClient } from "../../../src/backend/proxmox/api-client.js";

const SECRET = "0f9a6b2e-1d3c-4e5f-8a7b-9c0d1e2f3a4b";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchMock = ReturnType<
  typeof vi.fn<(url: string, init?: PluginFetchInit) => Promise<Response>>
>;

function fetchReturning(
  response: () => Response | Promise<Response>,
): FetchMock {
  return vi.fn(async (_url: string, _init?: PluginFetchInit) => response());
}

function client(
  fetch: FetchMock,
  tlsMode: "system" | "ca" | "insecure" = "ca",
) {
  return createProxmoxApiClient({
    fetch: fetch as never,
    baseUrl: "https://10.0.0.5:8006",
    tokenId: "termix@pve!stats",
    tokenSecret: SECRET,
    tlsMode,
    caPem: "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----",
  });
}

describe("createProxmoxApiClient", () => {
  it("sends the token header, allows only the node and trusts the CA", async () => {
    const fetch = fetchReturning(() =>
      jsonResponse({ data: { version: "8.2" } }),
    );
    const read = client(fetch);

    await expect(read("/version")).resolves.toEqual({ version: "8.2" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://10.0.0.5:8006/api2/json/version");
    expect(init?.headers?.Authorization).toBe(
      `PVEAPIToken=termix@pve!stats=${SECRET}`,
    );
    expect(init?.allowPrivateHosts).toEqual(["10.0.0.5"]);
    expect(init?.tls).toEqual({ ca: expect.stringContaining("BEGIN") });
  });

  it("skips verification only in insecure mode", async () => {
    const fetch = fetchReturning(() => jsonResponse({ data: [] }));
    await client(fetch, "insecure")("/nodes");
    expect(fetch.mock.calls[0]?.[1]?.tls).toEqual({
      rejectUnauthorized: false,
    });

    await client(fetch, "system")("/nodes");
    expect(fetch.mock.calls[1]?.[1]?.tls).toBeUndefined();
  });

  it("refuses CA mode without a certificate", () => {
    expect(() =>
      createProxmoxApiClient({
        fetch: vi.fn() as never,
        baseUrl: "https://pve:8006",
        tokenId: "termix@pve!stats",
        tokenSecret: SECRET,
        tlsMode: "ca",
        caPem: null,
      }),
    ).toThrow(expect.objectContaining({ code: "API_NOT_CONFIGURED" }));
  });

  it("maps 401 and 403 to their own codes", async () => {
    await expect(
      client(fetchReturning(() => jsonResponse({ data: null }, 401)))(
        "/version",
      ),
    ).rejects.toMatchObject({ code: "API_AUTH_FAILED" });
    await expect(
      client(fetchReturning(() => jsonResponse({ data: null }, 403)))("/nodes"),
    ).rejects.toMatchObject({ code: "API_FORBIDDEN" });
    await expect(
      client(fetchReturning(() => jsonResponse({ data: null }, 500)))("/nodes"),
    ).rejects.toMatchObject({ code: "API_REQUEST_FAILED" });
  });

  it("tells a certificate failure apart from an unreachable node", async () => {
    const tlsError = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "SELF_SIGNED_CERT_IN_CHAIN" },
    });
    await expect(
      client(fetchReturning(() => Promise.reject(tlsError)))("/version"),
    ).rejects.toMatchObject({ code: "API_TLS_FAILED" });

    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    await expect(
      client(fetchReturning(() => Promise.reject(refused)))("/version"),
    ).rejects.toMatchObject({ code: "API_UNREACHABLE" });
  });

  it("rejects bodies without data and unexpected paths", async () => {
    await expect(
      client(fetchReturning(() => jsonResponse({ nope: 1 })))("/version"),
    ).rejects.toMatchObject({ code: "API_BAD_RESPONSE" });
    const fetch = fetchReturning(() => jsonResponse({ data: null }));
    await expect(client(fetch)("/../access")).rejects.toMatchObject({
      code: "API_REQUEST_FAILED",
    });
    await expect(client(fetch)("/nodes?x=1")).rejects.toMatchObject({
      code: "API_REQUEST_FAILED",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
