import {
  defineTable,
  id,
  integer,
  real,
  refHost,
  refUser,
  text,
  timestamp,
} from "@termix-ssh/plugin-sdk/db";

/**
 * Per-host historical node stats samples (CPU, memory, disk, network),
 * polled on an interval while a viewer has the Proxmox stats tab open.
 *
 * Test build: fresh tables in this plugin's own namespace, no legacy adoption.
 */
export const proxmoxNodeHistory = defineTable("node_history", {
  id: id(),
  hostId: refHost(),
  ts: timestamp().notNull().defaultNow(),
  cpuPercent: real(),
  memPercent: real(),
  diskPercent: real(),
  netRxBytes: integer(),
  netTxBytes: integer(),
});

/**
 * One saved dashboard layout per user per host for the Proxmox stats tab.
 */
export const proxmoxStatsPreferences = defineTable(
  "stats_preferences",
  {
    id: id(),
    userId: refUser(),
    hostId: refHost(),
    // JSON-encoded layout. No secrets, so plain text.
    layout: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      {
        name: "idx_p_proxmox_fn_stats_prefs_user_host",
        columns: ["userId", "hostId"],
        unique: true,
      },
    ],
  },
);

export const tables = [proxmoxNodeHistory, proxmoxStatsPreferences];
