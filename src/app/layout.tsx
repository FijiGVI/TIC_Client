import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { AuthProvider } from "@/features/auth/AuthProvider";
import "./globals.css";
import "./polish.css";
import "./responsive.css";
import "./management.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TIC Employee Services",
  description: "Secure employee service request portal",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
