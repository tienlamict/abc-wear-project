import { describe, expect, it } from "vitest";
import { generateOrderCode, isOrderCode } from "@/lib/order-code";

describe("generateOrderCode", () => {
  it("uses the ABC-YYMMDD-XXXXX format", () => {
    const code = generateOrderCode(new Date("2026-10-13T03:00:00Z"));
    expect(code).toMatch(/^ABC-261013-[2-9A-HJ-NP-Z]{5}$/);
    expect(isOrderCode(code)).toBe(true);
  });

  it("dates the code in Vietnam time (UTC+7)", () => {
    // 18:30 UTC on Oct 13 is already Oct 14 in Vietnam.
    expect(generateOrderCode(new Date("2026-10-13T18:30:00Z"))).toMatch(/^ABC-261014-/);
  });

  it("is deterministic for a given random source", () => {
    const code = generateOrderCode(new Date("2026-01-05T00:00:00Z"), () => 0);
    expect(code).toBe("ABC-260105-22222");
  });

  it("produces different suffixes across calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOrderCode()));
    expect(codes.size).toBeGreaterThan(45);
  });

  it("rejects malformed codes", () => {
    expect(isOrderCode("ABC-261013-0OI1X")).toBe(false);
    expect(isOrderCode("abc-261013-ABCDE")).toBe(false);
    expect(isOrderCode("ABC-26101-ABCDE")).toBe(false);
  });
});
