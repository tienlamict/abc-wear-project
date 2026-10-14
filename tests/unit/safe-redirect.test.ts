import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/tai-khoan/don-hang?page=2")).toBe("/tai-khoan/don-hang?page=2");
    expect(safeNextPath("/")).toBe("/");
  });

  it("falls back for anything that could leave the site", () => {
    const bad = [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "tai-khoan",
      "",
      undefined,
      ["/a"],
      "/a\r\nb",
    ];
    for (const next of bad) expect(safeNextPath(next)).toBe("/tai-khoan");
    expect(safeNextPath(undefined, "/")).toBe("/");
  });
});
