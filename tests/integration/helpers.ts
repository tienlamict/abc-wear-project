import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { type MockMainOptions, buildMockMain } from "../../mock-main/app";

/** Starts a real mock Main System on a free port. */
export async function startMockMain(options?: MockMainOptions) {
  const app = buildMockMain(options);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

/** Empties the catalog tables and sync_log in the test database. */
export async function resetCatalog(): Promise<void> {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error("Refusing to reset: DATABASE_URL is not the test database");
  }
  await prisma.syncLog.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();
}
