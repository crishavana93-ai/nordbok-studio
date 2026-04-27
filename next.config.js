/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // receipt uploads
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

module.exports = nextConfig;
