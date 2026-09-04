import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  /* https fallback — layout metadata is only the base (page.tsx pins the
   * request host per-request); never emit http:// absolute URLs to crawlers.
   * NEXT_PUBLIC_SITE_URL is also coerced to https in case the env var was
   * set with an http:// scheme on the hosting dashboard. */
  metadataBase: new URL(
    (process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3000").replace(
      /^http:\/\//,
      "https://"
    )
  ),
  title: "Reelivo — what to watch tonight",
  description:
    "A daily where-to-watch guide. Find something worth your evening across films and series, see where it streams, and press play — free.",
  applicationName: "Reelivo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Reelivo",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Reelivo — what to watch tonight",
    description:
      "A daily where-to-watch guide. Find something worth your evening across films and series, see where it streams, and press play — free.",
    siteName: "Reelivo",
    url: "/",
    locale: "en_US",
    type: "website",
    /* width/height + alt are required by Messenger/WhatsApp/Slack unfurls —
     * without them some crawlers skip the card entirely. */
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Reelivo — what to watch tonight",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reelivo — what to watch tonight",
    description:
      "A daily where-to-watch guide. Find something worth your evening, see where it streams, and press play — free.",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Reelivo — what to watch tonight",
      },
    ],
  },
  /* HilltopAds revenue meta tag (their dashboard recommendation, article
   * "How to Boost Your Revenue with a Meta Tag"): no-referrer-when-downgrade
   * lets the browser send the full page URL as Referer on ad-tag/impression
   * requests, so Hilltop can classify content and match advertiser targeting
   * — meta-delivered policy overrides the HTTP header per the Referrer
   * Policy spec; the header in next.config.ts is kept in agreement. */
  other: {
    referrer: "no-referrer-when-downgrade",
  },
  /* HilltopAds site-ownership verification (user's dashboard tag) — rendered
   * server-side into <head> via the metadata API instead of a raw <meta> in
   * the JSX tree. */
  verification: {
    other: {
      d1f2c246731e6378bb11d6b9963814bccf076248:
        "d1f2c246731e6378bb11d6b9963814bccf076248",
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${manrope.variable} ${inter.variable} font-sans antialiased bg-background text-foreground`}
      >
        {/* Resource hints — TMDB artwork dominates every view's payload;
         * warming these connections shaves 100-300ms off the first image
         * on mobile networks. React 19 hoists <link> tags into <head> on
         * both SSR and client (official pattern — no manual head mgmt). */}
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.themoviedb.org" />
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          /* keep toasts clear of the mobile tab bar */
          mobileOffset="calc(64px + env(safe-area-inset-bottom))"
          toastOptions={{
            style: {
              background: "#10151d",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "#f2f5f7",
              borderRadius: "12px",
            },
          }}
        />
      </body>
    </html>
  );
}
