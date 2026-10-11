import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Client } from "ssh2";

const execElevated = vi.fn();
vi.mock("@termix-ssh/plugin-sdk/host-commands", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  execElevated: (...args: unknown[]) => execElevated(...args),
}));

const { execPveshCommand } = await import("../../src/backend/routes.js");

const client = {} as Client;

describe("Proxmox discovery sudo execution", () => {
  beforeEach(() => {
    execElevated.mockReset();
  });

  it("forces pvesh through the stored sudo credentials", async () => {
    execElevated.mockResolvedValue({
      stdout: '[{"type":"qemu"}]',
      stderr: "",
      code: 0,
      usedSudo: true,
    });

    await expect(
      execPveshCommand(client, "pvesh get /cluster/resources", "secret", 12000),
    ).resolves.toBe('[{"type":"qemu"}]');
    expect(execElevated).toHaveBeenCalledWith(
      client,
      "pvesh get /cluster/resources",
      "secret",
      { forceSudo: true, timeoutMs: 12000 },
    );
  });

  it("surfaces a failed elevated pvesh command", async () => {
    execElevated.mockResolvedValue({
      stdout: "",
      stderr: "pvesh failed",
      code: 255,
      usedSudo: true,
    });

    await expect(
      execPveshCommand(client, "pvesh get /cluster/resources", "secret"),
    ).rejects.toThrow("pvesh failed");
  });

  it("tries passwordless sudo when pvesh fails without a stored password", async () => {
    const commands: string[] = [];
    const fakeClient = {
      exec: (command: string, cb: (err: null, stream: unknown) => void) => {
        commands.push(command);
        const stream = Object.assign(new EventEmitter(), {
          stderr: new EventEmitter(),
        });
        cb(null, stream);
        const sudo = command.startsWith("sudo -n ");
        setTimeout(() => {
          if (sudo) stream.emit("data", Buffer.from("[]"));
          else stream.stderr.emit("data", Buffer.from("only root"));
          stream.emit("close", sudo ? 0 : 1);
        }, 0);
      },
    } as unknown as Client;

    await expect(
      execPveshCommand(fakeClient, "pvesh get /cluster/resources", undefined),
    ).resolves.toBe("[]");
    expect(commands).toEqual([
      "pvesh get /cluster/resources",
      "sudo -n pvesh get /cluster/resources",
    ]);
    expect(execElevated).not.toHaveBeenCalled();
  });
});
