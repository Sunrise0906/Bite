import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthDivider } from "@/components/auth/divider";
import { safeDecodeURIComponent } from "@/lib/url/safe-decode";

export const metadata = {
  title: "登录 · Bite",
};

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
        <h1 className="heading-display text-3xl text-[var(--text-strong)]">
          欢迎回来
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          登录你的 Bite 账号
        </p>
      </div>

      {error && (
        <p role="alert" className="alert-error">
          {safeDecodeURIComponent(error)}
        </p>
      )}

      <SignInForm next={next} />

      <AuthDivider>或</AuthDivider>

      <MagicLinkForm next={next} />

      <AuthDivider>或</AuthDivider>

      <GoogleButton next={next} />

      <p className="text-center text-sm text-[var(--text-muted)]">
        还没有账号？{" "}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="font-medium text-[var(--text-strong)] underline underline-offset-2 decoration-[var(--border-strong)] transition-colors hover:decoration-[var(--primary)]"
        >
          创建账号
        </Link>
      </p>
    </div>
  );
}
