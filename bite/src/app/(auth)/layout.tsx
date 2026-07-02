import Link from "next/link";
import { getTheme, getUiVersion } from "@/lib/ui-version";

export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 登录/注册页跟随 V2 主题（.ui-v2 下 field-input/btn/card 都有换肤），
  // V1 用户保持原样
  const ui = await getUiVersion();
  const theme = await getTheme();

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center px-6 py-12 sm:py-20 ${
        ui === "v2" ? `ui-v2 theme-${theme}` : ""
      }`}
    >
      <Link
        href="/"
        className="brand-mark mb-10 text-5xl transition-opacity hover:opacity-80"
      >
        Bite
      </Link>
      <div className="card w-full max-w-sm px-6 py-7 sm:px-8 sm:py-9">
        {children}
      </div>
    </div>
  );
}
