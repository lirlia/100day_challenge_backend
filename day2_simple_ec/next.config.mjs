// import type { NextConfig } from "next"; // この行を削除またはコメントアウト

const nextConfig = {
  images: {
    // remotePatterns は不要なので削除
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
