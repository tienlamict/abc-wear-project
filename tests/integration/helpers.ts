import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { type MockMainOptions, buildMockMain } from "../../mock-main/app";
import type { MockOrder } from "../../mock-main/types";

/** Starts a real mock Main System on a free port. */
export async function startMockMain(options?: MockMainOptions) {
  const app = buildMockMain(options);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

/** Empties the catalog tables and sync_log in the test database. */
export async function resetCatalog(): Promise<void> {
  assertTestDatabase();
  await prisma.syncLog.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();
}

function assertTestDatabase(): void {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error("Refusing to reset: DATABASE_URL is not the test database");
  }
}

/** Deletes every order and cart in the test database. */
export async function resetOrders(): Promise<void> {
  assertTestDatabase();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cart.deleteMany(); // items cascade
}

/** Deletes every member (with their orders and carts) in the test database. */
export async function resetMembers(): Promise<void> {
  await resetOrders();
  await prisma.member.deleteMany();
}

/** Switches the mock's simulated outage (`POST /sim/fail-mode`). */
export async function setFailMode(
  baseUrl: string,
  mode: "none" | "error" | "timeout",
  count?: number,
): Promise<void> {
  const res = await fetch(`${baseUrl}/sim/fail-mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, count }),
  });
  if (!res.ok) throw new Error(`fail-mode: HTTP ${res.status}`);
}

/** Orders the mock Main System has received. */
export async function mockOrders(baseUrl: string) {
  const res = await fetch(`${baseUrl}/sim/orders`);
  return ((await res.json()) as { orders: MockOrder[] }).orders;
}
