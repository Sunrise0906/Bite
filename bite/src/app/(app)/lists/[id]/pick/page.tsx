import Link from "next/link";
import { getOrCreatePickSession } from "@/lib/actions/pick";
import { PickDeck } from "@/components/v2/pick-deck";

type Params = Promise<{ id: string }>;

export const metadata = { title: "一起选 · Bite" };

export default async function PickPage({ params }: { params: Params }) {
  const { id } = await params;
  const data = await getOrCreatePickSession(id);

  return (
    <main className="v2-page" style={{ flex: 1 }}>
      <div className="v2-lhead">
        <Link href={`/lists/${id}`} className="v2-back">
          ‹ 返回清单
        </Link>
        <div className="row1">
          <h1>一起选</h1>
        </div>
        {"error" in data ? null : (
          <div className="stats">
            <span>{data.list_name}</span>
            <span>
              ·{" "}
              {data.member_count > 1
                ? "两个人都右滑同一家，就它了"
                : "右滑收藏，滑完随机挑一家"}
            </span>
          </div>
        )}
      </div>

      {"error" in data ? (
        <div className="v2-empty">
          <div className="t">进不去一起选</div>
          <div className="s">{data.error}</div>
        </div>
      ) : data.cards.length === 0 && data.my_votes === 0 ? (
        <div className="v2-empty">
          <div className="t">这个清单还没有「想去」的店</div>
          <div className="s">先加几家想去的，再来一起选</div>
        </div>
      ) : (
        // key 带 session + 进度戳：router.refresh 拿到新数据时强制重挂，
        // 否则 useState(initial) 停在旧 session 的状态（"刷新看看"会变 no-op）
        <PickDeck
          key={`${data.session_id}:${data.my_votes}:${data.cards.length}`}
          initial={data}
        />
      )}
    </main>
  );
}
