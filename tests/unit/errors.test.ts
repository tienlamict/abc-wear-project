import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, toErrorResponse } from "@/lib/errors";

describe("toErrorResponse", () => {
  it("maps AppError to its HTTP status and Vietnamese message", async () => {
    const res = toErrorResponse(new AppError("EMAIL_TAKEN"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EMAIL_TAKEN");
    expect(body.error.message).toMatch(/đã được đăng ký/);
    expect(body.error.details).toBeUndefined();
  });

  it("keeps a custom message and details", async () => {
    const res = toErrorResponse(new AppError("OUT_OF_STOCK", "Không đủ hàng", { skus: ["SKU-1"] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "OUT_OF_STOCK", message: "Không đủ hàng", details: { skus: ["SKU-1"] } },
    });
  });

  it("turns zod errors into VALIDATION_ERROR with per-field messages", async () => {
    const schema = z.object({ email: z.email(), qty: z.number().int().min(1) });
    const parsed = schema.safeParse({ email: "x", qty: 0 });
    expect(parsed.success).toBe(false);

    const res = toErrorResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.error.details.fields)).toEqual(["email", "qty"]);
  });

  it("hides unexpected errors behind INTERNAL_ERROR", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toErrorResponse(new Error("db exploded"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toMatch(/exploded/);
    spy.mockRestore();
  });
});
