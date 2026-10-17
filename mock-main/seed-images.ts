/**
 * `pnpm seed:images`: draws 2 placeholder images per seed product (800×800 WebP, background by
 * category, product name on top) and uploads them to MinIO as `products/{id}/seed-{n}.webp`.
 * Objects that already exist are skipped, so it is safe to run again.
 * The mock also runs it on start when the bucket is empty.
 */
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { loadEnvFile } from "../src/lib/load-env";
import { seedImageKey } from "./catalog-rules";
import { type ImageStorage, createMinioStorage, minioConfigFromEnv } from "./minio";
import seedData from "./seed.json";
import type { Seed, SeedProduct } from "./types";

const SIZE = 800;

/** Two background shades per category (image 1, image 2). */
const BACKGROUNDS: Record<string, [string, string]> = {
  "CAT-NAM-AO-THUN": ["#1e3a8a", "#3b5bb5"],
  "CAT-NAM-QUAN": ["#374151", "#5b6474"],
  "CAT-NU-AO": ["#9d174d", "#c0457a"],
  "CAT-NU-VAY": ["#6b21a8", "#8f4fc7"],
};
const FALLBACK: [string, string] = ["#4b5563", "#6b7280"];

const esc = (text: string) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Greedy word wrap at roughly `width` characters per line. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderSeedImage(product: SeedProduct, n: number): Promise<Buffer> {
  const background = (BACKGROUNDS[product.categoryId] ?? FALLBACK)[n - 1] ?? FALLBACK[0];
  const lines = wrap(product.name, 16);
  const lineHeight = 64;
  const top = SIZE / 2 - ((lines.length - 1) * lineHeight) / 2;
  const text = lines
    .map(
      (l, i) =>
        `<text x="${SIZE / 2}" y="${top + i * lineHeight}" font-size="52" font-weight="bold">${esc(l)}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
<g font-family="sans-serif" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">
${text}
<text x="${SIZE / 2}" y="${SIZE - 60}" font-size="28" opacity="0.8">${esc(product.id)} · ảnh ${n}</text>
</g></svg>`;
  return sharp({ create: { width: SIZE, height: SIZE, channels: 3, background } })
    .composite([{ input: Buffer.from(svg) }])
    .webp({ quality: 80 })
    .toBuffer();
}

export async function seedImages(
  storage: ImageStorage,
  products: SeedProduct[] = (seedData as Seed).products,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const product of products) {
    for (const n of [1, 2]) {
      const key = seedImageKey(product.id, n);
      if (await storage.exists(key)) {
        skipped++;
        continue;
      }
      await storage.put(key, await renderSeedImage(product, n));
      created++;
    }
  }
  return { created, skipped };
}

/** On mock start: seed images once, when the bucket has nothing in it yet. */
export async function seedImagesIfEmpty(storage: ImageStorage): Promise<void> {
  try {
    if (!(await storage.isEmpty())) return;
    console.log("[mock-main] MinIO bucket is empty, creating seed images…");
    const { created } = await seedImages(storage);
    console.log(`[mock-main] created ${created} seed images`);
  } catch (err) {
    console.warn(
      "[mock-main] could not check/create seed images (is MinIO running? docker compose up -d):",
      err instanceof Error ? err.message : err,
    );
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = minioConfigFromEnv();
  if (!config) {
    console.error("[seed:images] MINIO_ACCESS_KEY / MINIO_SECRET_KEY missing in .env");
    process.exit(1);
  }
  const { created, skipped } = await seedImages(createMinioStorage(config));
  console.log(
    `[seed:images] bucket ${config.bucket}: ${created} created, ${skipped} already there`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[seed:images] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
