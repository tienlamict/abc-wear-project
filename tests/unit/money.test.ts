import { describe, expect, it } from "vitest";
import { formatVnd } from "@/lib/money";

describe("formatVnd", () => {
  it.each([
    [0, "0 ₫"],
    [500, "500 ₫"],
    [30000, "30.000 ₫"],
    [499000, "499.000 ₫"],
    [1250000, "1.250.000 ₫"],
    [-30000, "-30.000 ₫"],
  ])("formats %d as %s", (amount, expected) => {
    expect(formatVnd(amount)).toBe(expected);
  });
});
