"use client";

import { useEffect } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { toast } from "sonner";

// Server actions redirect with ?toast=<key>&count=<n>; we surface as a toast
// then strip the params so refreshes don't replay.

const MESSAGES: Record<string, (count?: number) => string> = {
  place_added: () => "已添加店铺",
  places_added: (n) =>
    n && n > 1 ? `已添加 ${n} 家店` : "已添加店铺",
  place_updated: () => "已更新",
  place_deleted: () => "已删除",
  list_created: () => "已创建 list",
  list_renamed: () => "已重命名",
  list_deleted: () => "list 已删除",
};

export function ToastFlash() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const key = params.get("toast");
  const count = params.get("count");

  useEffect(() => {
    if (!key) return;
    const fn = MESSAGES[key];
    if (fn) {
      const n = count ? Number(count) : undefined;
      toast.success(fn(n));
    }
    const next = new URLSearchParams(params.toString());
    next.delete("toast");
    next.delete("count");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, count]);

  return null;
}
