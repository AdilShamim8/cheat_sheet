import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow preview domains to access dev server resources without CORS warnings
  allowedDevOrigins: ["*.space-z.ai", "*.chatglm.cn", "localhost", "127.0.0.1"],
};

export default nextConfig;
