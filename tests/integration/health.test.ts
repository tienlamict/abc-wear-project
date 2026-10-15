import { afterAll, describe, expect, it } from "vitest";
import { GET } from "../../app/api/healthz/route";
import { prisma } from "@/lib/db";

describe("GET /api/healthz", () => {
  afterAll(() => prisma.$disconnect());

  it("is 200 with db ok when MySQL answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", db: "ok" });
    expect(body.dbLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
