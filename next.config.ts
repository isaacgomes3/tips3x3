import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Uploads de APK/ZIP na área de Atualizações (admin).
  experimental: {
    proxyClientMaxBodySize: "120mb",
  },
};

export default nextConfig;
