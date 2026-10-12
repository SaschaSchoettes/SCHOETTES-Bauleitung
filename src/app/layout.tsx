import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/types";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Baustellenorganisation für alle Gewerke – Termine, Kontakte, Dokumente",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: "Bauportal",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#283b5c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
