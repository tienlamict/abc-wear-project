import { Client } from "minio";

/** Where Main keeps product images. Only Main writes; the website just loads public URLs. */
export interface ImageStorage {
  put(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** True when the bucket holds no object at all. */
  isEmpty(): Promise<boolean>;
}

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicUrl: string;
}

export const DEFAULT_PUBLIC_URL = "http://localhost:9000/product-images";

/** MINIO_* from the environment; null when the keys are missing (image features then answer 503). */
export function minioConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MinioConfig | null {
  if (!env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY) return null;
  return {
    endPoint: env.MINIO_ENDPOINT ?? "localhost",
    port: Number(env.MINIO_PORT ?? 9000),
    useSSL: env.MINIO_USE_SSL === "true",
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    bucket: env.MINIO_BUCKET ?? "product-images",
    publicUrl: env.MINIO_PUBLIC_URL ?? DEFAULT_PUBLIC_URL,
  };
}

/** Public URL of an object, e.g. `http://localhost:9000/product-images/products/P000001/x.webp`. */
export const publicUrlOf = (base: string, key: string) => `${base.replace(/\/+$/, "")}/${key}`;

// Keys never change content (a new upload gets a new uuid), so browsers may cache for a year.
const OBJECT_HEADERS = {
  "Content-Type": "image/webp",
  "Cache-Control": "public, max-age=31536000, immutable",
};

export function createMinioStorage(config: MinioConfig): ImageStorage {
  const client = new Client({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
  const { bucket } = config;

  return {
    async put(key, data) {
      await client.putObject(bucket, key, data, data.length, OBJECT_HEADERS);
    },

    async remove(key) {
      await client.removeObject(bucket, key);
    },

    async exists(key) {
      try {
        await client.statObject(bucket, key);
        return true;
      } catch (err) {
        if ((err as { code?: string }).code === "NotFound") return false;
        throw err;
      }
    },

    async isEmpty() {
      const stream = client.listObjectsV2(bucket, "", true);
      try {
        for await (const _object of stream) return false;
        return true;
      } finally {
        stream.destroy();
      }
    },
  };
}
