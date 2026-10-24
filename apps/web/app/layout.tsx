import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({children}:{children:ReactNode}) {
  return <html lang="ru"><head><script src="https://telegram.org/js/telegram-web-app.js?64"/></head><body>{children}</body></html>;
}
