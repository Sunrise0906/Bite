import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { GoogleButton } from "@/components/auth/google-button";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">登录</h1>
        <p className="mt-1 text-sm text-zinc-500">回到你的餐厅 list</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          {decodeURIComponent(error)}
        </p>
      )}

      <SignInForm next={next} />

      <Divider>或</Divider>

      <MagicLinkForm next={next} />

      <Divider>或</Divider>

      <GoogleButton next={next} />

      <p className="text-center text-sm text-zinc-500">
        还没有账号？{" "}
        <Link
          href="/signup"
          className="font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          注册
        </Link>
      </p>
    </div>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-400">
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
