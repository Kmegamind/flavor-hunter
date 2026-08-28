import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /**
   * Cloud Run ships a container, so the image should carry only what the server needs.
   * `standalone` emits a self-contained `.next/standalone` with a pruned node_modules —
   * roughly a tenth of a full install, which is the difference between a cold start the
   * judge waits through and one they do not notice.
   */
  output: "standalone",
}

export default nextConfig
