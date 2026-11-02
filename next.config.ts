import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` output is for the Docker image (docker/Dockerfile.web) and the
  // Hostinger VPS deployment. Vercel builds don't need (or use) it, so only
  // enable it when building inside the Docker image.
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  // Allow the Z.ai preview proxy origins to load /_next/* assets in dev mode
  allowedDevOrigins: [
    "*.space-z.ai",
    "localhost:3000",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
