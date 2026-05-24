import Link from "next/link";
import { loadInvitePreview } from "@/lib/actions/invites";
import { AcceptInviteForm } from "@/components/invites/accept-invite-form";

export const metadata = {
  title: "邀请 · Bite",
};

type Params = Promise<{ token: string }>;

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const preview = await loadInvitePreview(token);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8 sm:py-16">
      <h1 className="heading-display text-2xl">List 邀请</h1>

      {!preview && (
        <div className="card mt-6 px-5 py-6 text-center text-sm text-zinc-600">
          ⚠ 这个邀请链接无效或已被撤销
        </div>
      )}

      {preview && preview.is_owner && (
        <div className="card mt-6 px-5 py-6 text-sm text-zinc-700">
          这是你自己创建的邀请。把链接发给朋友就行——你不能自己加入自己。
          <div className="mt-4">
            <Link
              href={`/lists/${preview.list_id}`}
              className="btn-secondary inline-block px-4 py-2 text-sm"
            >
              回到 list
            </Link>
          </div>
        </div>
      )}

      {preview && preview.used && !preview.is_owner && (
        <div className="card mt-6 px-5 py-6 text-center text-sm text-zinc-600">
          这个邀请链接已经被使用过了
        </div>
      )}

      {preview && preview.expired && !preview.used && !preview.is_owner && (
        <div className="card mt-6 px-5 py-6 text-center text-sm text-zinc-600">
          这个邀请链接已过期
        </div>
      )}

      {preview && !preview.is_owner && !preview.used && !preview.expired && (
        <div className="card mt-6 px-5 py-6">
          <p className="text-sm text-zinc-600">朋友邀请你加入这个 list：</p>
          <p className="mt-2 text-2xl font-medium text-[var(--text-strong)]">
            {preview.list_name}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            角色：{preview.role === "co_owner" ? "共同所有者（可编辑）" : "查看者（只读）"}
          </p>
          <div className="mt-5">
            <AcceptInviteForm token={preview.token} />
          </div>
        </div>
      )}
    </main>
  );
}
