import Link from "next/link";
import { getOrCreatePickSession } from "@/lib/actions/pick";
import { getTheme, getUiVersion } from "@/lib/ui-version";
import { PickDeck } from "@/components/v2/pick-deck";

type Params = Promise<{ id: string }>;

export const metadata = { title: "一起选 · Bite" };

export default async function PickPage({ params }: { params: Params }) {
  const { id } = await params;
  const data = await getOrCreatePickSession(id);

  // V1 用户直接访问该 URL 时局部套 V2 皮（入口只在 V2 清单页有）
  const needsWrap = (await getUiVersion()) !== "v2";
  const theme = await getTheme();
  const wrapCls = needsWrap ? `ui-v2 theme-${theme}` : "";

  return (
    // V1 时 wrapper 套在外层——v2.css 的规则都是 `.ui-v2 .v2-page` 后代选择器，
    // 拼在同一个元素上不匹配（容器宽度/边距会全部失效）
    <div
      className={wrapCls || undefined}
      style={{ flex: 1, display: "flex", flexDirection: "column" }}
    >
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
    </div>
  );
}
