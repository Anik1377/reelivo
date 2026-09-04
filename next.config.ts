import type { NextConfig } from "next";

/*
 * Security headers — the browser-facing half of the "Not secure" fix.
 *
 * - Strict-Transport-Security: remembered by browsers once the public host
 *   serves real TLS; ignored (harmless) over plain http.
 * - Content-Security-Policy: upgrade-insecure-requests — on an https page any
 *   stray http:// subresource is auto-upgraded, killing mixed-content
 *   warnings; inert on http pages. Deliberately the ONLY directive: a full
 *   source list would fight Next's inline runtime and the provider iframes.
 * - No X-Frame-Options / frame-ancestors ON PURPOSE — the sandbox Preview
 *   Panel embeds the app in a cross-origin iframe, and framing protection
 *   would blank it out.
 * - No microphone restriction — Reelivo has voice search.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  /* no-referrer-when-downgrade (not the stricter default) on purpose:
   * HilltopAds' revenue meta-tag program needs the full page URL as Referer
   * on ad-tag/impression requests for content classification + advertiser
   * targeting. The <meta name="referrer"> in layout.tsx carries the same
   * policy (meta overrides header per spec) — kept identical so there is no
   * mixed signal for browsers that prioritize either source. */
  { key: "Referrer-Policy", value: "no-referrer-when-downgrade" },
  { key: "Content-Security-Policy", value: "upgrade-insecure-requests" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), display-capture=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
