"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createListInPlace } from "@/lib/actions/lists";

/**
 * 在 quick-add 流程里：用户还没有任何可写 list 时，让 ta 在原地建一个，
 * 不必离开页面（不然 LLM 抽取的草稿就空跑了）。
 */
export function InlineCreateList({
  message = "你还没有可写的 list — 先建一个，然后会自动回到这里继续。",
}: {
  message?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名字不能空");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createListInPlace(trimmed);
      if ("error" in r) {
        setError(r.error);
      } else {
        // 服务端已 revalidate /quick-add，refresh 让 page 重跑 query
        router.refresh();
      }
    });
  }

  return (
    <div className="card p-5">
      <p className="text-sm text-zinc-600">{message}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          autoFocus
          placeholder="比如「Irvine 想吃的」"
          className="field-input flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="btn-primary px-4 py-2 text-sm"
        >
          {pending ? "建中..." : "建 list"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
