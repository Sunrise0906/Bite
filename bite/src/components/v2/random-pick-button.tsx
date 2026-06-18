"use client";

import { useRouter } from "next/navigation";

type Pick = { listId: string; placeId: string };

/** 「随便选」：从想去候选里随机挑一家直接打开 */
export function RandomPickButton({ picks }: { picks: Pick[] }) {
  const router = useRouter();
  function go() {
    if (picks.length === 0) {
      router.push("/chat");
      return;
    }
    const p = picks[Math.floor(Math.random() * picks.length)];
    router.push(`/lists/${p.listId}/places/${p.placeId}/edit`);
  }
  return (
    <button type="button" className="cta2" onClick={go}>
      随便选
    </button>
  );
}
