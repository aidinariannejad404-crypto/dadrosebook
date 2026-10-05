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

/** Django API as seen from the Next.js server (rewrite target for same-origin /api/v1 calls). */
const apiInternal = (process.env.API_INTERNAL_URL || "http://localhost:8000/api/v1").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  // Django URLs end with "/"; keep it (no 308 to the slash-less URL) for the /api/v1 proxy.
  skipTrailingSlashRedirect: true,
  // Phase 3: browser calls go same-origin to /api/v1/* so the httpOnly auth cookies are first-party.
  async rewrites() {
    return [
      { source: "/api/v1/:path*/", destination: `${apiInternal}/:path*/` },
      { source: "/api/v1/:path*", destination: `${apiInternal}/:path*` },
    ];
  },
  // Phase 6: the reader is private and must not be framed, cached, indexed or leak its URL.
  async headers() {
    return [
      // Phase 6b: reader app-shell worker (scope "/" from the site root needs no Service-Worker-Allowed);
      // always revalidated so a new deployment's worker is picked up.
      {
        source: "/reader-sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/read/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
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
