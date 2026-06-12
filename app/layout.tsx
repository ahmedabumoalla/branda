import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barndaksa | برندة",
  description: "منصة إدارة العلامات التجارية والولاء والطلبات والحجوزات.",
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
