import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/types";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Bauportal",
    description: "Baustellenorganisation für alle Gewerke",
    start_url: "/projekte",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#1e3a5f",
    lang: "de",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
