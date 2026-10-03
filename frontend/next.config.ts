import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

/**
 * Remote image hosts. Covers/sample pages come from the Django media server in dev
 * (localhost:8000 from the browser, backend:8000 inside docker) and from the public
 * S3 bucket in production (NEXT_PUBLIC_MEDIA_HOST, e.g. dadrose.s3.ir-thr-at1.arvanstorage.ir).
 */
const remotePatterns: RemotePattern[] = [
  { protocol: "http", hostname: "localhost", port: "8000" },
  { protocol: "http", hostname: "127.0.0.1", port: "8000" },
  { protocol: "http", hostname: "backend", port: "8000" },
];
const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOST;
if (mediaHost) {
  remotePatterns.push({ protocol: "https", hostname: mediaHost });
}

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Always render <title>/<meta>/Open Graph inside <head> (no metadata streaming): link previews in
  // Telegram/Instagram/WhatsApp and non-JS crawlers only read the initial <head>.
  htmlLimitedBots: /.*/,
  // Inline the (small, ~10 KB gzipped) CSS into the HTML: removes two render-blocking requests on
  // first load; measured +4 Lighthouse points and lower LCP on the homepage (Phase 5).
  experimental: { inlineCss: true },
  images: {
    remotePatterns,
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
