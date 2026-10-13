import type { OrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { transition } from "@/lib/order-state";

const ALL: OrderStatus[] = [
  "CONFIRMED",
  "SENT_TO_MAIN",
  "PICKING",
  "SHIPPING",
  "DELIVERED",
  "DELIVERY_FAILED",
];

const VALID: [OrderStatus, OrderStatus][] = [
  ["CONFIRMED", "SENT_TO_MAIN"],
  ["SENT_TO_MAIN", "PICKING"],
  ["PICKING", "SHIPPING"],
  ["SHIPPING", "DELIVERED"],
  ["SHIPPING", "DELIVERY_FAILED"],
];

const isValid = (from: OrderStatus, to: OrderStatus) =>
  VALID.some(([f, t]) => f === from && t === to);

describe("transition", () => {
  it.each(VALID)("allows %s → %s", (from, to) => {
    expect(transition(from, to)).toEqual({ kind: "changed", status: to });
  });

  it.each(ALL)("treats %s → itself as unchanged", (status) => {
    expect(transition(status, status)).toEqual({ kind: "unchanged", status });
  });

  const invalid = ALL.flatMap((from) =>
    ALL.filter((to) => to !== from && !isValid(from, to)).map((to) => [from, to] as const),
  );

  it.each(invalid)("rejects %s → %s and keeps the current status", (from, to) => {
    const result = transition(from, to);
    expect(result.kind).toBe("invalid");
    expect(result.status).toBe(from);
  });

  it("covers every pair of statuses", () => {
    expect(VALID.length + ALL.length + invalid.length).toBe(ALL.length * ALL.length);
  });
});
