import { describe, expect, it } from "vitest";
import {
  isValidTokenId,
  isValidTokenSecret,
  parseProxmoxApiConfig,
  resolveProxmoxApiBaseUrl,
} from "../../../src/backend/proxmox/api-config.js";

describe("parseProxmoxApiConfig", () => {
  it("defaults to SSH with a CA check", () => {
    expect(parseProxmoxApiConfig(undefined)).toEqual({
      transport: "ssh",
      baseUrl: null,
      tokenId: null,
      tlsMode: "ca",
      caPem: null,
    });
  });

  it("reads an object or a JSON string and trims values", () => {
    const value = {
      transport: "api",
      baseUrl: " https://pve1:8006 ",
      tokenId: "termix@pve!stats",
      tlsMode: "insecure",
      caPem: "",
    };
    const expected = {
      transport: "api",
      baseUrl: "https://pve1:8006",
      tokenId: "termix@pve!stats",
      tlsMode: "insecure",
      caPem: null,
    };
    expect(parseProxmoxApiConfig(value)).toEqual(expected);
    expect(parseProxmoxApiConfig(JSON.stringify(value))).toEqual(expected);
  });

  it("ignores unknown transports and TLS modes", () => {
    const parsed = parseProxmoxApiConfig({ transport: "ftp", tlsMode: "x" });
    expect(parsed.transport).toBe("ssh");
    expect(parsed.tlsMode).toBe("ca");
  });
});

describe("token validation", () => {
  it("accepts user@realm!tokenid", () => {
    expect(isValidTokenId("root@pam!termix")).toBe(true);
    expect(isValidTokenId("svc.termix@pve!stats-1")).toBe(true);
  });

  it("rejects ids that would break the auth header", () => {
    expect(isValidTokenId("root@pam")).toBe(false);
    expect(isValidTokenId("root@pam!to ken")).toBe(false);
    expect(isValidTokenId("root@pam!a=b")).toBe(false);
  });

  it("accepts only UUID secrets", () => {
    expect(isValidTokenSecret("0f9a6b2e-1d3c-4e5f-8a7b-9c0d1e2f3a4b")).toBe(
      true,
    );
    expect(isValidTokenSecret("secret\nInjected: header")).toBe(false);
  });
});

describe("resolveProxmoxApiBaseUrl", () => {
  it("requires a URL instead of deriving one from the host address", () => {
    expect(() => resolveProxmoxApiBaseUrl({ baseUrl: null })).toThrow(
      expect.objectContaining({ code: "API_NOT_CONFIGURED" }),
    );
  });

  it("reduces a configured URL to its origin", () => {
    expect(
      resolveProxmoxApiBaseUrl({
        baseUrl: "https://pve.example.com:8006/#v1:0:18",
      }),
    ).toBe("https://pve.example.com:8006");
    expect(
      resolveProxmoxApiBaseUrl({ baseUrl: "https://[fd00::5]:8006" }),
    ).toBe("https://[fd00::5]:8006");
  });

  it("refuses plain http and embedded credentials", () => {
    expect(() =>
      resolveProxmoxApiBaseUrl({ baseUrl: "http://pve:8006" }),
    ).toThrow(/https/);
    expect(() =>
      resolveProxmoxApiBaseUrl({ baseUrl: "https://a:b@pve:8006" }),
    ).toThrow(/https/);
  });
});
