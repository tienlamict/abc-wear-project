import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { BCRYPT_ROUNDS, hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing on a worker thread", () => {
  it("hashes with bcrypt cost 10 and verifies", async () => {
    const hash = await hashPassword("matkhau123");
    expect(BCRYPT_ROUNDS).toBe(10);
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(bcrypt.compareSync("matkhau123", hash)).toBe(true); // compatible with plain bcryptjs
    expect(await verifyPassword("matkhau123", hash)).toBe(true);
    expect(await verifyPassword("sai", hash)).toBe(false);
  });

  it("keeps the event loop free while bcrypt runs", async () => {
    const hash = bcrypt.hashSync("matkhau123", BCRYPT_ROUNDS);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    const started = Date.now();
    await Promise.all([1, 2, 3].map(() => verifyPassword("matkhau123", hash)));
    clearInterval(timer);
    const elapsed = Date.now() - started;
    // On the request thread, three compares would block ~270 ms with no timer tick at all.
    expect(ticks).toBeGreaterThan(Math.floor(elapsed / 5 / 4));
  });
});
