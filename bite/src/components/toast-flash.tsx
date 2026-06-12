"use client";

import { useEffect } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { toast } from "sonner";

// Server actions redirect with ?toast=<key>&count=<n>&updated=<m>; we surface as
// a toast then strip the params so refreshes don't replay.

type ToastArgs = { count?: number; updated?: number };

const MESSAGES: Record<string, (args: ToastArgs) => string> = {
  place_added: () => "已添加店铺",
  places_added: ({ count, updated }) => {
    const total = count ?? 0;
    const merged = updated ?? 0;
    if (total <= 1) return "已添加店铺";
    if (merged > 0) {
      const added = total - merged;
      if (added === 0) return `已合并 ${merged} 家到已有店铺`;
      return `已添加 ${added} 家 · 合并 ${merged} 家`;
    }
    return `已添加 ${total} 家店`;
  },
  place_updated: () => "已更新",
  place_deleted: () => "已删除",
  list_created: () => "已创建 list",
  list_renamed: () => "已重命名",
  list_deleted: () => "list 已删除",
  convo_deleted: () => "对话已删除",
  invite_accepted: () => "已加入 list",
  place_merged: () => "已合并到已有店铺",
};

export function ToastFlash() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const key = params.get("toast");
  const count = params.get("count");
  const updated = params.get("updated");

  useEffect(() => {
    if (!key) return;
    const fn = MESSAGES[key];
    if (fn) {
      toast.success(
        fn({
          count: count ? Number(count) : undefined,
          updated: updated ? Number(updated) : undefined,
        }),
      );
    }
    const next = new URLSearchParams(params.toString());
    next.delete("toast");
    next.delete("count");
    next.delete("updated");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, count, updated]);

  return null;
}
