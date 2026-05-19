import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { List, Place, PlaceStatus } from "@/lib/db/types";
import { RenameListForm } from "@/components/lists/rename-list-form";
import { DeleteListButton } from "@/components/lists/delete-list-button";
import { PlaceCard } from "@/components/places/place-card";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

const STATUS_ORDER: Record<PlaceStatus, number> = {
  want_to_go: 0,
  visited: 1,
  archived: 2,
};

const STATUS_LABEL: Record<PlaceStatus, string> = {
  want_to_go: "想去",
  visited: "已去过",
  archived: "归档",
};

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error: errorParam } = await searchParams;

  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: list }, { data: placesData }] = await Promise.all([
    supabase
      .from("lists")
      .select("*")
      .eq("id", id)
      .maybeSingle<List>(),
    supabase
      .from("places")
      .select("*")
      .eq("list_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  if (!list) notFound();

  const places = (placesData ?? []) as Place[];
  const isOwner = list.owner_id === user.id;

  // 按 status 分组
  const grouped = new Map<PlaceStatus, Place[]>();
  for (const status of Object.keys(STATUS_ORDER) as PlaceStatus[]) {
    grouped.set(status, []);
  }
  for (const p of places) {
    grouped.get(p.status)?.push(p);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <Link
        href="/lists"
        className="mb-4 inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ‹ 返回所有 list
      </Link>

      <header className="mb-6">
        <RenameListForm id={list.id} currentName={list.name} />
        <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
          <span>{places.length} 家店</span>
          {!isOwner && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
              共享 list
            </span>
          )}
        </div>
      </header>

      {errorParam && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          {decodeURIComponent(errorParam)}
        </p>
      )}

      <div className="mb-6">
        <Link
          href={`/lists/${list.id}/places/new`}
          className="block w-full rounded-lg bg-zinc-900 px-4 py-3 text-center text-base font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          + 新增店铺
        </Link>
        <p className="mt-1 text-center text-xs text-zinc-500">
          Phase 2 将支持粘贴小红书 / 自由文本 / AI 解析
        </p>
      </div>

      {places.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
          这个 list 还没有店铺。先添加一个吧。
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(STATUS_ORDER) as PlaceStatus[]).map((status) => {
            const items = grouped.get(status) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={status}>
                <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {STATUS_LABEL[status]} · {items.length}
                </h2>
                <ul className="space-y-2">
                  {items.map((p) => (
                    <li key={p.id}>
                      <PlaceCard place={p} currentUserId={user.id} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {isOwner && (
        <section className="mt-12 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h3 className="mb-3 text-sm font-medium text-zinc-500">设置</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">危险操作</span>
            <DeleteListButton id={list.id} name={list.name} />
          </div>
        </section>
      )}
    </main>
  );
}
