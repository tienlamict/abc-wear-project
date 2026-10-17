import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "minio";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MinioConfig, createMinioStorage, minioConfigFromEnv } from "../../mock-main/minio";
import { startMockMain } from "./helpers";

// Spec M6 step 8: the mock Main System against a real MinIO (docker compose up -d), in a
// separate bucket so test objects never mix with the dev catalog's images.
const BUCKET = "product-images-test";
const AUTH = `Basic ${Buffer.from("admin:test-pw").toString("base64")}`;
const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures", name));

async function testBucket(): Promise<{ config: MinioConfig; client: Client }> {
  const env = minioConfigFromEnv();
  if (!env)
    throw new Error("MINIO_ACCESS_KEY / MINIO_SECRET_KEY missing (copy .env.example to .env)");
  const base = new URL(env.publicUrl);
  const config = { ...env, bucket: BUCKET, publicUrl: `${base.origin}/${BUCKET}` };
  const client = new Client(config);
  try {
    if (!(await client.bucketExists(BUCKET))) await client.makeBucket(BUCKET);
  } catch (err) {
    throw new Error(`MinIO is not reachable (docker compose up -d): ${(err as Error).message}`);
  }
  // Same as minio-init for the real bucket: anyone may download, nobody may write anonymously.
  await client.setBucketPolicy(
    BUCKET,
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${BUCKET}/*`],
        },
      ],
    }),
  );
  return { config, client };
}

function form(files: { name: string; data: Buffer; type?: string }[]): FormData {
  const data = new FormData();
  for (const f of files) {
    data.append(
      "files",
      new Blob([new Uint8Array(f.data)], { type: f.type ?? "image/jpeg" }),
      f.name,
    );
  }
  return data;
}

describe("mock Main System image upload with real MinIO (AD-03)", () => {
  let mock: Awaited<ReturnType<typeof startMockMain>>;
  let client: Client;
  let productId: string;

  const admin = (path: string, init: RequestInit = {}) =>
    fetch(`${mock.baseUrl}/admin/api${path}`, {
      ...init,
      headers: { authorization: AUTH, ...init.headers },
    });

  const upload = async (files: Parameters<typeof form>[0]) => {
    const res = await admin(`/products/${productId}/images`, { method: "POST", body: form(files) });
    expect(res.status).toBe(200);
    return (await res.json()) as {
      results: { file: string; ok: boolean; error?: string; image?: { id: string; url: string } }[];
      images: { id: string; url: string }[];
    };
  };

  const objectKeys = async () => {
    const keys: string[] = [];
    for await (const o of client.listObjectsV2(BUCKET, `products/${productId}/`, true)) {
      if (o.name) keys.push(o.name);
    }
    return keys;
  };

  beforeAll(async () => {
    const bucket = await testBucket();
    client = bucket.client;
    mock = await startMockMain({
      storage: createMinioStorage(bucket.config),
      imagePublicUrl: bucket.config.publicUrl,
      admin: { user: "admin", password: "test-pw" },
    });
    const res = await admin("/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Sản phẩm test ảnh",
        categoryId: "CAT-NU-AO",
        variants: [{ size: "M", color: "Đen", price: 100000, qty: 1 }],
      }),
    });
    expect(res.status).toBe(201);
    productId = (await res.json()).product.id;
    // Leftovers from an earlier run of this test would count against nothing (new product),
    // but keep the bucket tidy.
    for (const key of await objectKeys()) await client.removeObject(BUCKET, key);
  });

  afterAll(async () => {
    for (const key of await objectKeys().catch(() => [])) {
      await client.removeObject(BUCKET, key).catch(() => undefined);
    }
    await mock?.app.close();
  });

  it("rejects requests without basic auth (401)", async () => {
    const res = await fetch(`${mock.baseUrl}/admin/api/products/${productId}/images`, {
      method: "POST",
      body: form([{ name: "a.jpg", data: fixture("sample.jpg") }]),
    });
    expect(res.status).toBe(401);
    expect(await objectKeys()).toEqual([]);
  });

  it("stores valid images as public WebP ≤ 1200 px; rejects a fake image and a file over 5 MB", async () => {
    const big = await sharp(randomBytes(1500 * 1500 * 3), {
      raw: { width: 1500, height: 1500, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);

    const body = await upload([
      { name: "sample.jpg", data: fixture("sample.jpg") },
      { name: "sample.png", data: fixture("sample.png"), type: "image/png" },
      { name: "fake-image.jpg", data: fixture("fake-image.jpg") },
      { name: "big.png", data: big, type: "image/png" },
    ]);
    expect(body.results.map((r) => r.ok)).toEqual([true, true, false, false]);
    expect(body.results[2]!.error).toMatch(/JPEG, PNG hoặc WebP/);
    expect(body.results[3]!.error).toBe("File vượt quá 5 MB.");
    expect(await objectKeys()).toHaveLength(2);

    for (const result of body.results.filter((r) => r.ok)) {
      // Public URL, no credentials: what the website's browser loads.
      const res = await fetch(result.image!.url);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
      expect(res.headers.get("cache-control")).toContain("immutable");
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect(meta.format).toBe("webp");
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1200);
    }

    // Anonymous writes are refused by the bucket policy.
    const anonymousPut = await fetch(`${body.images[0]!.url.replace(/[^/]+$/, "")}evil.webp`, {
      method: "PUT",
      body: "x",
    });
    expect(anonymousPut.status).toBe(403);
  });

  it("refuses the 9th image of a product", async () => {
    const existing = (await (await admin(`/products/${productId}`)).json()).images.length;
    const png = { name: "more.png", data: fixture("sample.png"), type: "image/png" };
    const body = await upload(Array.from({ length: 9 - existing }, () => png));
    const results = body.results;
    expect(results.slice(0, 8 - existing).every((r) => r.ok)).toBe(true);
    expect(results.at(-1)).toMatchObject({ ok: false });
    expect(results.at(-1)!.error).toMatch(/tối đa 8 ảnh/);
    expect(body.images).toHaveLength(8);
    expect(await objectKeys()).toHaveLength(8);
  });

  it("deleting an image removes the object from MinIO", async () => {
    const before = (await (await admin(`/products/${productId}`)).json()).images as {
      id: string;
      url: string;
    }[];
    const target = before[0]!;
    const res = await admin(`/products/${productId}/images/${target.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).images.map((i: { id: string }) => i.id)).not.toContain(target.id);
    expect(await objectKeys()).not.toContain(`products/${productId}/${target.id}.webp`);
    expect((await fetch(target.url)).status).toBe(404);
  });
});
