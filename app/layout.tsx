import type { Metadata, Viewport } from "next";
import { RoutePrefetcher } from "@/components/performance/route-prefetcher";
import "./globals.css";

const BARNDAKSA_APP_ICON = "/brand/barndaksa-app-icon-512.png";

export const metadata: Metadata = {
  title: "Barndaksa | برندة",
  description: "منصة إدارة العلامات التجارية والولاء والطلبات والحجوزات.",
  applicationName: "برندة",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/brand/barndaksa-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: BARNDAKSA_APP_ICON, sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "برندة",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#652117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className="h-full antialiased"
      style={
        {
          "--font-geist-sans": "Arial, Tahoma, system-ui, sans-serif",
          "--font-geist-mono": "Consolas, monospace",
        } as React.CSSProperties
      }
    >
      <body className="flex min-h-full flex-col">
        <RoutePrefetcher />
        {children}
      </body>
    </html>
  );
}
