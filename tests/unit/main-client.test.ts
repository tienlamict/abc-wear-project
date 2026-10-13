import type { AddressInfo } from "node:net";
import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HttpMainSystemClient, MainSystemError, type SyncLogEntry } from "@/modules/integration";

describe("HttpMainSystemClient", () => {
  const server = Fastify();
  let mode: "slow" | "500" | "bad-json" | "bad-shape" | "ok" = "ok";
  let baseUrl = "";
  const logs: SyncLogEntry[] = [];

  beforeAll(async () => {
    server.get("/main/stock", async (_req, reply) => {
      if (mode === "slow") await new Promise((r) => setTimeout(r, 500));
      if (mode === "500") return reply.code(500).send("boom");
      if (mode === "bad-json") return reply.type("application/json").send("{not json");
      if (mode === "bad-shape") return { items: [{ sku: "A", qty: "many" }] };
      return { items: [{ sku: "A", qty: 3 }] };
    });
    await server.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${(server.server.address() as AddressInfo).port}/`;
  });
  afterAll(() => server.close());
  beforeEach(() => {
    logs.length = 0;
  });

  const client = () =>
    new HttpMainSystemClient({ baseUrl, timeoutMs: 200, log: async (e) => void logs.push(e) });

  it("returns parsed data and logs one OK row", async () => {
    mode = "ok";
    expect(await client().fetchStock()).toEqual([{ sku: "A", qty: 3 }]);
    expect(logs).toEqual([
      { direction: "IN", iface: "IF-02", recordKey: undefined, result: "OK", message: "items=1" },
    ]);
  });

  it.each([
    ["slow", "timeout"],
    ["500", "http"],
    ["bad-json", "invalid_response"],
    ["bad-shape", "invalid_response"],
  ] as const)("maps a %s response to a %s error and logs ERROR", async (m, kind) => {
    mode = m;
    const err = await client()
      .fetchStock()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MainSystemError);
    expect((err as MainSystemError).kind).toBe(kind);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ iface: "IF-02", result: "ERROR" });
  });
});
