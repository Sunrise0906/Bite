import Link from "next/link";
import { CreateListForm } from "@/components/lists/create-list-form";
import { QuickAddInput } from "@/components/places/quick-add-input";
import { createClient, requireUser } from "@/lib/supabase/server";

type ListWithCount = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  places: Array<{ count: number }>;
};

export default async function ListsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lists")
    .select(
      "id, name, owner_id, created_at, updated_at, places(count)",
    )
    .order("created_at", { ascending: false });

  const lists = (data ?? []) as ListWithCount[];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-7">
        <h1 className="heading-display text-3xl sm:text-4xl">我的 list</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          按用途分组管理你的餐厅收藏
        </p>
      </header>

      <div className="mb-5">
        <QuickAddInput />
      </div>

      <div className="mb-6">
        <CreateListForm />
      </div>

      {error && (
        <p role="alert" className="mb-4 alert-error">
          加载失败：{error.message}
        </p>
      )}

      {lists.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2.5">
          {lists.map((list) => {
            const count = list.places[0]?.count ?? 0;
            const isShared = list.owner_id !== user.id;
            return (
              <li key={list.id}>
                <Link
                  href={`/lists/${list.id}`}
                  className="card card-interactive flex items-center justify-between px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-base font-medium text-[var(--text-strong)]">
                        {list.name}
                      </span>
                      {isShared && (
                        <span className="chip chip-neutral">共享</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {count} 家店
                    </p>
                  </div>
                  <span aria-hidden="true" className="ml-3 text-zinc-400">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <svg
        aria-hidden="true"
        width="56"
        height="56"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-4 text-[var(--primary)]"
      >
        <circle cx="32" cy="32" r="22" />
        <circle cx="32" cy="32" r="15" strokeDasharray="2 3" opacity="0.5" />
        <path d="M22 28c0-2.5 2-4 4-4M42 28c0-2.5-2-4-4-4" strokeLinecap="round" />
        <path d="M28 38c1.5 1.5 4 2 4 2s2.5-.5 4-2" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-zinc-600">还没有 list</p>
      <p className="mt-1 text-xs text-zinc-500">
        在上面输入一个名字，比如 "Irvine 想吃的"
      </p>
    </div>
  );
}
