import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Offshore Wind Intelligence",
  description: "Global offshore wind intelligence platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
