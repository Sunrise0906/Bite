import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Bite · 餐厅记录",
  description: "餐厅记录 + AI 决策 + 朋友共享",
  applicationName: "Bite",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Bite",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1612" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className={`${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          duration={2800}
        />
        <PwaRegister />
      </body>
    </html>
  );
}
