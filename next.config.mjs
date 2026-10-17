// Product images live in MinIO (Main System's bucket); next/image may only load from there.
const imagesBase = new URL(process.env.MINIO_PUBLIC_URL ?? "http://localhost:9000/product-images");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: imagesBase.protocol.replace(":", ""),
        hostname: imagesBase.hostname,
        port: imagesBase.port,
        pathname: `${imagesBase.pathname.replace(/\/+$/, "")}/**`,
      },
    ],
    formats: ["image/webp"],
    minimumCacheTTL: 31536000, // object keys never change content
  },
};

export default nextConfig;
