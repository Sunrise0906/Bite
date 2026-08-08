import type { Metadata, Viewport } from "next";
import {
  Fraunces,
  Inter,
  Playfair_Display,
  Space_Grotesk,
} from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";
import { getTheme } from "@/lib/theme-server";
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 主题类名挂在 <html>（根元素）上，不是内层 div —— 这一点是有意义的：
  // globals.css 在 :root 上声明了一批**派生 token**（--status-want-bg: var(--gold-soft)
  // 等 12 个）。自定义属性的 var() 是在「声明它的那个元素」上求值的，所以只要主题
  // 覆写不落在同一个元素上，这些派生 token 就永远取不到主题值——四套主题的状态 chip
  // 会全部渲染成基底陶土色。把 ui-v2/theme-* 提到 <html>，主题覆写与 :root 声明就
  // 落在同一元素上，级联自然解析正确（.ui-v2 与 :root 同特异性，v2.css 后引入者胜）。
  const theme = await getTheme();

  return (
    <html
      lang="zh-CN"
      className={`${fraunces.variable} ${inter.variable} ${playfair.variable} ${spaceGrotesk.variable} h-full antialiased ui-v2 theme-${theme}`}
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
