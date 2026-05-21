import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { GoogleButton } from "@/components/auth/google-button";

type SearchParams = Promise<{ error?: string }>;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

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
          {decodeURIComponent(error)}
        </p>
      )}

      <SignUpForm />

      <Divider>或</Divider>

      <GoogleButton />

      <p className="text-center text-sm text-zinc-500">
        已经有账号？{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--text-strong)] underline underline-offset-2 decoration-zinc-300"
        >
          登录
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
