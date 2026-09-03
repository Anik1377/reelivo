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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
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
    type: "website",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reelivo — what to watch tonight",
    description:
      "A daily where-to-watch guide. Find something worth your evening, see where it streams, and press play — free.",
    images: ["/api/og"],
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
