import type { Metadata, Viewport } from "next";
import {
  Fraunces,
  Inter,
  Playfair_Display,
  Space_Grotesk,
} from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";
import "./v2.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

// V2 UI 用的无衬线（V1 不引用，仅 .ui-v2 下生效）
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// 主题字体：深夜食堂（奢华衬线）
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

// 主题字体：鲜果软糖（粗几何无衬线）
const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
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
      className={`${fraunces.variable} ${inter.variable} ${playfair.variable} ${spaceGrotesk.variable} h-full antialiased`}
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
