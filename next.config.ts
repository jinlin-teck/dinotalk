import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["msedge-tts"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      if (Array.isArray(config.externals)) {
        config.externals.push("node:sqlite");
      } else {
        config.externals = [config.externals, "node:sqlite"].filter(Boolean);
      }
    }
    return config;
  },
};

export default nextConfig;
