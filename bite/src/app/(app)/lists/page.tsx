import Link from "next/link";
import { CreateListForm } from "@/components/lists/create-list-form";
import { QuickAddPlaceholder } from "@/components/places/quick-add-placeholder";
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
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">我的 list</h1>
        <p className="mt-1 text-sm text-zinc-500">
          按用途分组管理你的餐厅收藏
        </p>
      </header>

      <div className="mb-5">
        <QuickAddPlaceholder />
      </div>

      <div className="mb-6">
        <CreateListForm />
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          加载失败：{error.message}
        </p>
      )}

      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
          还没有 list。新建一个开始吧 👆
        </div>
      ) : (
        <ul className="space-y-2">
          {lists.map((list) => {
            const count = list.places[0]?.count ?? 0;
            const isShared = list.owner_id !== user.id;
            return (
              <li key={list.id}>
                <Link
                  href={`/lists/${list.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-base font-medium">
                        {list.name}
                      </span>
                      {isShared && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          共享
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {count} 家店
                    </p>
                  </div>
                  <span className="ml-3 text-zinc-400">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
