import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthDivider } from "@/components/auth/divider";
import { safeDecodeURIComponent } from "@/lib/url/safe-decode";

export const metadata = {
  title: "注册 · Bite",
};

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="heading-display text-3xl">开个号</h1>
        <p className="mt-2 text-sm text-zinc-500">
          开始记录你的餐厅，做更好的决策
        </p>
      </div>

      {error && (
        <p role="alert" className="alert-error">
          {safeDecodeURIComponent(error)}
        </p>
      )}

      <SignUpForm next={next} />

      <AuthDivider>或</AuthDivider>

      <GoogleButton next={next} />

      <p className="text-center text-sm text-zinc-500">
        已经有账号？{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-[var(--text-strong)] underline underline-offset-2 decoration-zinc-300"
        >
          登录
        </Link>
      </p>
    </div>
  );
}
