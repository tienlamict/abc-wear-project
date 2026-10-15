import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn(async () => Promise.reject(new Error("connect ECONNREFUSED"))) },
}));

describe("GET /api/healthz when the database is down", () => {
  it("answers 503 with db down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("../../app/api/healthz/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "error", db: "down", dbLatencyMs: null });
  });
});
