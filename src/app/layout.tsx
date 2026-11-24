import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { AuthProvider } from "@/features/auth/AuthProvider";
import hrLogo from "@/assets/logo/Logo_HR.png";
import "./globals.css";
import "./polish.css";
import "./responsive.css";
import "./management.css";
import "./design-system.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GVI Ticketing System",
  description: "Secure employee service request portal",
  icons: {
    icon: [{ url: hrLogo.src, type: "image/png" }],
    shortcut: [{ url: hrLogo.src, type: "image/png" }],
    apple: [{ url: hrLogo.src, type: "image/png" }],
  },
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
