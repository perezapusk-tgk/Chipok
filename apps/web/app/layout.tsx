import type { ReactNode } from "react";
import type { Viewport } from "next";
import "./globals.css";
import "./final-polish.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({children}:{children:ReactNode}) {
  return <html lang="ru"><head><script src="https://telegram.org/js/telegram-web-app.js?64"/></head><body>{children}</body></html>;
}
