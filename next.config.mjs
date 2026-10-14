/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Product images are SVG placeholders served by Main System; show them as-is.
  images: { unoptimized: true },
};

export default nextConfig;
