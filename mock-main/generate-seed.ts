/**
 * Writes mock-main/seed.json. Output is deterministic (fixed PRNG seed), so re-running
 * produces the same file: 6 categories on 2 levels, 40 products, 3–4 sizes × 1–2 colors each.
 * Product ids follow Main's rule (`P` + 6 digits), SKUs the admin's `{productId}-{size}-{color}`.
 * Images are MinIO object keys; `pnpm seed:images` creates the objects.
 * Run: pnpm mock:seed
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COLOR_CODES, productIdFor, seedImageKey } from "./catalog-rules";
import type { Seed, SeedCategory, SeedProduct, SeedVariant } from "./types";

// mulberry32: tiny deterministic PRNG.
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = prng(20261013);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!;

const categories: SeedCategory[] = [
  { id: "CAT-NAM", parentId: null, name: "Nam", slug: "nam" },
  { id: "CAT-NAM-AO-THUN", parentId: "CAT-NAM", name: "Áo thun nam", slug: "ao-thun-nam" },
  { id: "CAT-NAM-QUAN", parentId: "CAT-NAM", name: "Quần nam", slug: "quan-nam" },
  { id: "CAT-NU", parentId: null, name: "Nữ", slug: "nu" },
  { id: "CAT-NU-AO", parentId: "CAT-NU", name: "Áo nữ", slug: "ao-nu" },
  { id: "CAT-NU-VAY", parentId: "CAT-NU", name: "Váy đầm", slug: "vay-dam" },
];

const NAMES: Record<string, { names: string[]; price: [number, number] }> = {
  "CAT-NAM-AO-THUN": {
    names: [
      "Áo thun nam cổ tròn basic",
      "Áo thun nam cổ tim",
      "Áo thun nam oversize",
      "Áo thun nam in hình phố thị",
      "Áo thun polo nam",
      "Áo thun nam kẻ sọc",
      "Áo thun thể thao nam",
      "Áo thun nam cotton compact",
      "Áo thun nam tay raglan",
      "Áo thun nam henley",
    ],
    price: [149, 349],
  },
  "CAT-NAM-QUAN": {
    names: [
      "Quần jeans nam slim fit",
      "Quần jeans nam ống suông",
      "Quần kaki nam",
      "Quần short nam",
      "Quần jogger nam",
      "Quần tây nam",
      "Quần short jeans nam",
      "Quần nỉ nam",
      "Quần cargo nam",
      "Quần linen nam",
    ],
    price: [299, 699],
  },
  "CAT-NU-AO": {
    names: [
      "Áo thun nữ basic",
      "Áo thun nữ croptop",
      "Áo sơ mi nữ công sở",
      "Áo blouse nữ tay phồng",
      "Áo kiểu nữ cổ vuông",
      "Áo len nữ dệt kim",
      "Áo khoác nữ dáng ngắn",
      "Áo thun nữ in chữ",
      "Áo hai dây nữ",
      "Áo sơ mi nữ linen",
    ],
    price: [179, 499],
  },
  "CAT-NU-VAY": {
    names: [
      "Váy midi xếp ly",
      "Váy chữ A",
      "Váy jeans ngắn",
      "Đầm suông cổ tròn",
      "Đầm maxi hoa nhí",
      "Đầm công sở dáng ôm",
      "Đầm sơ mi thắt eo",
      "Váy len dệt kim",
      "Đầm babydoll",
      "Đầm hai dây lụa",
    ],
    price: [259, 899],
  },
};

const COLORS = Object.entries(COLOR_CODES).map(([name, code]) => ({ name, code }));

const SIZES = ["S", "M", "L", "XL", "XXL"] as const;

const MATERIALS = ["cotton 100%", "cotton pha spandex", "vải linen thoáng mát", "vải kaki co giãn"];
const FITS = ["dáng suông dễ mặc", "dáng ôm vừa vặn", "form rộng thoải mái"];

const products: SeedProduct[] = [];
const createdBase = Date.UTC(2026, 6, 1, 2, 0, 0); // 2026-07-01 09:00 Vietnam time

for (const [categoryId, { names, price }] of Object.entries(NAMES)) {
  for (const name of names) {
    const index = products.length + 1;
    const id = productIdFor(index);

    const sizeCount = int(3, 4);
    const sizeStart = int(0, SIZES.length - sizeCount);
    const sizes = SIZES.slice(sizeStart, sizeStart + sizeCount);

    const firstColor = pick(COLORS);
    const colors =
      rand() < 0.5 ? [firstColor] : [firstColor, pick(COLORS.filter((c) => c !== firstColor))];

    const basePrice = int(price[0] / 10, price[1] / 10) * 10_000;
    const allOut = index === 7 || index === 26; // fully out of stock, for PS-04 demos

    const variants: SeedVariant[] = colors.flatMap((color) =>
      sizes.map((size) => ({
        sku: `${id}-${size}-${color.code}`,
        size,
        color: color.name,
        price: size === "XXL" ? basePrice + 30_000 : basePrice,
        qty: allOut || rand() < 0.1 ? 0 : int(1, 50),
      })),
    );

    products.push({
      id,
      categoryId,
      name,
      description:
        `${name} chất liệu ${pick(MATERIALS)}, ${pick(FITS)}. ` +
        `Có ${colors.length > 1 ? "các màu " + colors.map((c) => c.name.toLowerCase()).join(", ") : "màu " + firstColor.name.toLowerCase()}, ` +
        `size ${sizes.join(", ")}. Giặt máy ở nhiệt độ thường, không dùng chất tẩy.`,
      images: [seedImageKey(id, 1), seedImageKey(id, 2)],
      isActive: true,
      createdAt: new Date(
        createdBase + (index - 1) * 86_400_000 + int(0, 8) * 3_600_000,
      ).toISOString(),
      variants,
    });
  }
}

const seed: Seed = { categories, products };
const out = fileURLToPath(new URL("./seed.json", import.meta.url));
writeFileSync(out, JSON.stringify(seed, null, 2) + "\n");

const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
const zeroCount = products.reduce((n, p) => n + p.variants.filter((v) => v.qty === 0).length, 0);
console.log(
  `[mock-main] wrote ${out}: ${categories.length} categories, ${products.length} products, ` +
    `${variantCount} variants (${zeroCount} out of stock)`,
);
