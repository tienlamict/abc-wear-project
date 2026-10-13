import { prisma } from "@/lib/db";
import type { Iface } from "./types";

export interface SyncLogEntry {
  direction: "IN" | "OUT";
  iface: Iface;
  recordKey?: string | null;
  result: "OK" | "ERROR" | "RETRY";
  message?: string | null;
}

/** Records one exchange with Main System. Never throws: logging must not break the flow. */
export async function writeSyncLog(entry: SyncLogEntry): Promise<void> {
  try {
    await prisma.syncLog.create({
      data: {
        direction: entry.direction,
        iface: entry.iface,
        recordKey: entry.recordKey ?? null,
        result: entry.result,
        message: entry.message ?? null,
      },
    });
  } catch (err) {
    console.error("[integration] failed to write sync_log", entry, err);
  }
}
