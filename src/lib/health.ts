import { prisma } from "./db";

export interface Health {
  status: "ok" | "error";
  db: "ok" | "down";
  /** Round trip of `SELECT 1`, in ms. */
  dbLatencyMs: number | null;
  time: string;
}

/** NF-02: the web process is healthy when it can reach the Selling DB. */
export async function checkHealth(): Promise<Health> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      db: "ok",
      dbLatencyMs: Date.now() - started,
      time: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[healthz] database unreachable:", err instanceof Error ? err.message : err);
    return { status: "error", db: "down", dbLatencyMs: null, time: new Date().toISOString() };
  }
}
