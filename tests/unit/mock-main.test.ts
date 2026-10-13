import { afterAll, describe, expect, it } from "vitest";
import { buildMockMain } from "../../mock-main/app";

describe("mock-main", () => {
  const app = buildMockMain();
  afterAll(() => app.close());

  it("responds on /healthz", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "mock-main" });
  });
});
