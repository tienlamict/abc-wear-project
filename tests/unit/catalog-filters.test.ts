import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { compareSizes, filtersToQuery, parseProductFilters } from "@/modules/catalog/filters";

describe("parseProductFilters", () => {
  it("applies defaults to an empty query", () => {
    expect(parseProductFilters(new URLSearchParams())).toEqual({
      size: [],
      color: [],
      sort: "newest",
      page: 1,
    });
  });

  it("reads every filter from a query string", () => {
    const filters = parseProductFilters(
      new URLSearchParams(
        "q=+ao thun+&category=nam&size=M&size=L,XL&color=Đen&minPrice=100000&maxPrice=300000&sort=price_asc&page=2",
      ),
    );
    expect(filters).toEqual({
      q: "ao thun",
      category: "nam",
      size: ["M", "L", "XL"],
      color: ["Đen"],
      minPrice: 100_000,
      maxPrice: 300_000,
      sort: "price_asc",
      page: 2,
    });
  });

  it("accepts Next.js searchParams objects and ignores empty form fields", () => {
    const filters = parseProductFilters({ q: "", size: ["M", "M"], minPrice: "", sort: undefined });
    expect(filters).toMatchObject({ size: ["M"], sort: "newest" });
    expect(filters.q).toBeUndefined();
    expect(filters.minPrice).toBeUndefined();
  });

  it("strict mode rejects invalid values", () => {
    expect(() => parseProductFilters({ page: "abc" })).toThrow(ZodError);
    expect(() => parseProductFilters({ sort: "cheapest" })).toThrow(ZodError);
    expect(() => parseProductFilters({ minPrice: "-1" })).toThrow(ZodError);
    expect(() => parseProductFilters({ minPrice: "500", maxPrice: "100" })).toThrow(ZodError);
  });

  it("lenient mode drops only the invalid fields", () => {
    expect(parseProductFilters({ page: "abc", q: "váy", sort: "x" }, "lenient")).toEqual({
      q: "váy",
      size: [],
      color: [],
      sort: "newest",
      page: 1,
    });
    const swapped = parseProductFilters({ minPrice: "500", maxPrice: "100" }, "lenient");
    expect(swapped.minPrice).toBe(500);
    expect(swapped.maxPrice).toBeUndefined();
  });
});

describe("filtersToQuery", () => {
  it("round-trips through parseProductFilters and leaves defaults out", () => {
    const filters = parseProductFilters({
      q: "áo",
      size: ["M", "L"],
      maxPrice: "200000",
      sort: "price_desc",
      page: "3",
    });
    const query = filtersToQuery(filters);
    expect(query.toString()).toBe("q=%C3%A1o&size=M&size=L&maxPrice=200000&sort=price_desc&page=3");
    expect(parseProductFilters(query)).toEqual(filters);
    expect(filtersToQuery(parseProductFilters({})).toString()).toBe("");
  });

  it("can omit keys", () => {
    const filters = parseProductFilters({ category: "nam", page: "2", size: "S" });
    expect(filtersToQuery(filters, ["page", "category"]).toString()).toBe("size=S");
  });
});

describe("compareSizes", () => {
  it("orders clothing sizes, unknown ones last", () => {
    expect(["XL", "Free", "S", "XXL", "M", "28", "L"].sort(compareSizes)).toEqual([
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "28",
      "Free",
    ]);
  });
});
