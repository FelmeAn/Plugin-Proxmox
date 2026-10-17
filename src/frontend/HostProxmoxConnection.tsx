import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { PlugZap } from "lucide-react";
import {
  Button,
  Input,
  PasswordInput,
  SectionCard,
  Select2,
  SettingRow,
  Textarea,
} from "@termix-ssh/plugin-sdk/ui";
import type { ProxmoxApiConfig, ProxmoxSecretValue } from "./types";

export const DEFAULT_API_CONFIG: ProxmoxApiConfig = {
  transport: "ssh",
  baseUrl: null,
  tokenId: null,
  tlsMode: "ca",
  caPem: null,
};

interface HostProxmoxConnectionForm {
  proxmoxApiConfig: ProxmoxApiConfig | null;
  proxmoxApiTokenSecret: ProxmoxSecretValue;
}

type SetHostField = (key: string, value: unknown) => void;

/** https://<address>:8006, the URL a node answers on by default. */
export function defaultApiUrl(address: string | null | undefined): string {
  const trimmed = (address ?? "").trim();
  if (!trimmed) return "";
  const host =
    trimmed.includes(":") && !trimmed.startsWith("[")
      ? `[${trimmed}]`
      : trimmed;
  return `https://${host}:8006`;
}

const SELECT_CLASS =
  "h-7 w-44 text-xs border border-border bg-background px-2 outline-none focus:ring-1 focus:ring-ring";

function isStoredSecret(value: ProxmoxSecretValue): boolean {
  return !!value && typeof value === "object" && value.set === true;
}

/**
 * Picks SSH or the Proxmox REST API for every Proxmox feature of this host.
 * The token secret is a secret host setting: the browser only learns whether
 * one is stored, and sending the redacted value back leaves it unchanged.
 */
export function HostProxmoxConnection({
  form,
  setField,
  hostAddress,
}: {
  form: HostProxmoxConnectionForm;
  setField: SetHostField;
  /** The host's address, to suggest the API URL. */
  hostAddress?: string | null;
}) {
  const { t } = useTranslation();
  const cfg = { ...DEFAULT_API_CONFIG, ...(form.proxmoxApiConfig ?? {}) };
  // What the host had when the editor opened, so emptying the input puts the
  // stored secret back instead of deleting it.
  const [storedSecret] = useState<ProxmoxSecretValue>(
    form.proxmoxApiTokenSecret,
  );
  const secretValue = form.proxmoxApiTokenSecret;
  const hasStoredSecret = isStoredSecret(storedSecret);
  const secretRemoved = hasStoredSecret && secretValue === "";

  const update = (patch: Partial<ProxmoxApiConfig>) =>
    setField("proxmoxApiConfig", { ...cfg, ...patch });

  return (
    <SectionCard
      title={t("hosts.proxmoxConnection")}
      icon={<PlugZap className="size-3.5" />}
    >
      <div className="flex flex-col gap-0 py-1">
        <SettingRow
          label={t("hosts.proxmoxTransport")}
          description={t("hosts.proxmoxTransportDesc")}
        >
          <Select2
            value={cfg.transport}
            onChange={(e) =>
              e.target.value === "api"
                ? update({
                    transport: "api",
                    // Stored explicitly: the token must only ever go where
                    // the owner pointed it, not follow later address edits.
                    baseUrl: cfg.baseUrl || defaultApiUrl(hostAddress) || null,
                  })
                : update({ transport: "ssh" })
            }
            className={SELECT_CLASS}
          >
            <option value="ssh">{t("hosts.proxmoxTransportSsh")}</option>
            <option value="api">{t("hosts.proxmoxTransportApi")}</option>
          </Select2>
        </SettingRow>
        {cfg.transport === "api" && (
          <>
            <SettingRow
              label={t("hosts.proxmoxApiUrl")}
              description={t("hosts.proxmoxApiUrlDesc")}
            >
              <Input
                className="w-56 h-7 text-xs"
                value={cfg.baseUrl ?? ""}
                onChange={(e) => update({ baseUrl: e.target.value || null })}
                placeholder={
                  defaultApiUrl(hostAddress) || "https://pve.example.com:8006"
                }
              />
            </SettingRow>
            <SettingRow
              label={t("hosts.proxmoxApiTokenId")}
              description={t("hosts.proxmoxApiTokenIdDesc")}
            >
              <Input
                className="w-56 h-7 text-xs"
                value={cfg.tokenId ?? ""}
                onChange={(e) => update({ tokenId: e.target.value || null })}
                placeholder="termix@pve!stats"
                autoComplete="off"
              />
            </SettingRow>
            <SettingRow
              label={t("hosts.proxmoxApiTokenSecret")}
              description={t("hosts.proxmoxApiTokenSecretDesc")}
            >
              <div className="flex items-center gap-2">
                <PasswordInput
                  className="w-56 h-7 text-xs"
                  value={typeof secretValue === "string" ? secretValue : ""}
                  onChange={(e) =>
                    setField(
                      "proxmoxApiTokenSecret",
                      e.target.value === "" && hasStoredSecret
                        ? storedSecret
                        : e.target.value,
                    )
                  }
                  placeholder={
                    hasStoredSecret && !secretRemoved
                      ? t("hosts.proxmoxApiTokenSecretSet")
                      : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  }
                  autoComplete="new-password"
                />
                {hasStoredSecret && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setField(
                        "proxmoxApiTokenSecret",
                        secretRemoved ? storedSecret : "",
                      )
                    }
                  >
                    {secretRemoved
                      ? t("hosts.proxmoxApiTokenSecretKeep")
                      : t("hosts.proxmoxApiTokenSecretClear")}
                  </Button>
                )}
              </div>
            </SettingRow>
            <SettingRow
              label={t("hosts.proxmoxApiTls")}
              description={
                cfg.tlsMode === "insecure"
                  ? t("hosts.proxmoxApiTlsInsecureWarning")
                  : t("hosts.proxmoxApiTlsDesc")
              }
            >
              <Select2
                value={cfg.tlsMode}
                onChange={(e) =>
                  update({
                    tlsMode:
                      e.target.value === "system" ||
                      e.target.value === "insecure"
                        ? e.target.value
                        : "ca",
                  })
                }
                className={SELECT_CLASS}
              >
                <option value="ca">{t("hosts.proxmoxApiTlsCa")}</option>
                <option value="system">{t("hosts.proxmoxApiTlsSystem")}</option>
                <option value="insecure">
                  {t("hosts.proxmoxApiTlsInsecure")}
                </option>
              </Select2>
            </SettingRow>
            {cfg.tlsMode === "ca" && (
              <SettingRow
                label={t("hosts.proxmoxApiCaPem")}
                description={t("hosts.proxmoxApiCaPemDesc")}
              >
                <Textarea
                  className="w-72 min-h-24 font-mono text-[10px]"
                  value={cfg.caPem ?? ""}
                  onChange={(e) => update({ caPem: e.target.value || null })}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  spellCheck={false}
                />
              </SettingRow>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}
