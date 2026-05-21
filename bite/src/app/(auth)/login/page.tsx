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
        <h1 className="heading-display text-3xl">欢迎回来</h1>
        <p className="mt-2 text-sm text-zinc-500">登录你的 Bite 账号</p>
      </div>

      {error && (
        <p role="alert" className="alert-error">
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
          className="font-medium text-[var(--text-strong)] underline underline-offset-2 decoration-zinc-300"
        >
          创建账号
        </Link>
      </p>
    </div>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-400">
      <div className="h-px flex-1 bg-zinc-200" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}
