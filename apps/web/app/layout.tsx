import type { ReactNode } from "react";
import type { Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({children}:{children:ReactNode}) {
  return <html lang="ru"><head><script src="https://telegram.org/js/telegram-web-app.js?64"/></head><body>{children}</body></html>;
}
