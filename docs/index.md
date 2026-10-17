Proxmox finds the VMs and LXC containers on a Proxmox VE node and imports them as hosts, so you don't add each one by hand. It can keep them in sync as guests come and go, and shows node, guest, storage and cluster stats in their own tab.

It reaches the node in one of two ways, set per node under Proxmox connection:

- SSH (pvesh): Termix signs in over SSH and runs `pvesh`. No API token needed. This is the default.
- Proxmox API: Termix calls the node's REST API on port 8006 with an API token. No SSH login or root rights on the node.

This page is about managing guests on a Proxmox server you already run. To install Termix itself on Proxmox, see [Proxmox install](/install/server/proxmox).

## Set up the node

1. Add your Proxmox node as a normal SSH host. The SSH user needs to be able to run `pvesh`, so `root` or a user with the right rights.
2. Open the node in Manage, go to its Proxmox section and turn on Enable Proxmox.
3. Pick how imported guests sign in under Default Auth Type, and a Default Credential if you use one.
4. Save.

## Use the Proxmox API instead of SSH

1. On the node, create a user and an API token for Termix, for example under Datacenter, Permissions, API Tokens. Read access is enough:
   - Give the token the `PVEAuditor` role on `/`. That covers guests, node, storage and cluster stats.
   - For the IPs of VMs, which come from the QEMU guest agent, also add `VM.GuestAgent.Audit` (Proxmox VE 9) or `VM.Monitor` (Proxmox VE 8 and older) in a custom role.
   - With privilege separation on, the token needs these permissions itself, not only its user.
2. In Termix, open the node in Manage, go to its Proxmox section and set Connect via to Proxmox API.
3. Enter the token ID (`user@realm!tokenid`) and its secret. The secret is stored encrypted and never sent back to the browser.
4. Under Certificate check, keep Cluster CA and paste `/etc/pve/pve-root-ca.pem` from any node. Use System trust store if the node has a publicly trusted certificate. Don't verify skips the check and should only be used for testing.
5. Check the API URL. It is filled in with the host's address on port 8006 when you switch to the API; change it if the node answers elsewhere, for example behind a load balancer. It stays as saved when the host's address changes later, so the token only ever goes where you pointed it.

The API is called straight from the Termix server, so the node must be reachable from there. Jump hosts are only used for SSH. Only the node's owner can change the API settings or run discovery and sync with its token; people the node is shared with can still open its stats.

In API mode the network card shows each interface's address and link state, but no traffic counters, because the API does not report them.

## Import guests

1. Pick Discover & import Proxmox guests from the node's menu.
2. Termix lists every VM and container in the cluster, with its status and IP when it has one.
3. Select the ones you want and import them.

Imported guests go in a folder named after their node.

Termix guesses how each guest connects:

- Windows / RDP detection: guests whose name matches one of these patterns are set up for RDP, if [Remote Desktop](/plugins/remote-desktop) is on.
- Docker detection: guests whose name matches turn on [Docker](/plugins/docker).

Both are comma separated name patterns, not case sensitive. You can change any guest before importing.

## Keep them in sync

Turn on Auto sync guests and set a Sync interval (5 minutes or more). Termix rediscovers the node on that schedule and creates or updates hosts to match. It runs as you, while your account is unlocked.

## Proxmox Stats

Turn on Enable Proxmox Stats on the node and pick Proxmox Stats from its menu. The tab shows:

- Node CPU, memory, disk, network, uptime and PVE version.
- Every guest with its state and use. Filter by VM or LXC and search.
- Storage pools.
- Cluster health and quorum.

Poll interval sets how often it refreshes, 15 seconds or more. If the node name isn't the same as its hostname, set Node name override.

## Troubleshooting

- pvesh was not found: The host isn't a Proxmox node, or the SSH user can't run `pvesh`.
- Proxmox rejected the API token: The token ID or secret is wrong, or the token has expired.
- The API token lacks a permission: Check the roles on the token, not only on its user, when privilege separation is on.
- The certificate could not be verified: Paste the cluster's `pve-root-ca.pem` again, or check that the API URL uses a name or address the node's certificate covers.
- Guests have no IP: Proxmox only knows a VM's IP when the QEMU guest agent runs in it. Install the agent, or set the address by hand after import. In API mode the token also needs `VM.GuestAgent.Audit` or `VM.Monitor`.
