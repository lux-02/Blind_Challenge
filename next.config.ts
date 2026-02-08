import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.pstatic.net", pathname: "/**" },
      { protocol: "https", hostname: "pstatic.net", pathname: "/**" },
    ],
  },
};

export default nextConfig;
