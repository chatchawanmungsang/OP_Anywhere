import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Required for large Excel uploads through middleware/proxy
    proxyClientMaxBodySize: "500mb",
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
