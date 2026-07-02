import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getTheme, getUiVersion } from "@/lib/ui-version";

export const metadata = { title: "统计 · Bite" };

// /stats —— 吃喝足迹回顾。图表遵循 dataviz 规范：
// 单一度量 → 单色编码（菜系条=primary、月度柱=sage），文字只用 ink/muted token；
// 条形 thin marks + 数据端 4px 圆角 + 行间 2px 留白；KPI 用 stat tile 不硬画图。

type PlaceRow = {
  id: string;
  status: string;
  cuisine: string[] | null;
};
type LogRow = { place_id: string; visited_at: string };

const MONTH_LABEL = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

export default async function StatsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const needsWrap = (await getUiVersion()) !== "v2";
  const theme = await getTheme();
  const wrapCls = needsWrap ? `ui-v2 theme-${theme}` : "";

  // 我可见的所有清单下的店 + 我自己的造访记录
  const [{ data: ownerLists }, { data: memberLists }] = await Promise.all([
    supabase.from("lists").select("id").eq("owner_id", user.id),
    supabase.from("list_members").select("list_id").eq("user_id", user.id),
  ]);
  const listIds = [
    ...(ownerLists ?? []).map((l) => l.id),
    ...(memberLists ?? []).map((m) => m.list_id),
  ];

  let places: PlaceRow[] = [];
  if (listIds.length > 0) {
    const { data } = await supabase
      .from("places")
      .select("id, status, cuisine")
      .in("list_id", listIds);
    places = (data ?? []) as PlaceRow[];
  }
  const { data: logsData } = await supabase
    .from("visit_logs")
    .select("place_id, visited_at")
    .eq("user_id", user.id)
    .order("visited_at", { ascending: false })
    .limit(1000);
  const logs = (logsData ?? []) as LogRow[];

  // ---- KPI ----
  const total = places.length;
  const visited = places.filter((p) => p.status === "visited").length;
  const visitCount = logs.length;

  // 最爱菜系：按「我造访过的店」的菜系出现次数
  const placeById = new Map(places.map((p) => [p.id, p]));
  const cuisineVisitCount = new Map<string, number>();
  for (const log of logs) {
    for (const c of placeById.get(log.place_id)?.cuisine ?? []) {
      cuisineVisitCount.set(c, (cuisineVisitCount.get(c) ?? 0) + 1);
    }
  }
  const favCuisine =
    [...cuisineVisitCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // ---- 菜系分布（库内店按菜系，Top 8，其余合并「其他」）----
  const cuisineCount = new Map<string, number>();
  for (const p of places)
    for (const c of p.cuisine ?? [])
      cuisineCount.set(c, (cuisineCount.get(c) ?? 0) + 1);
  const sortedCuisine = [...cuisineCount.entries()].sort((a, b) => b[1] - a[1]);
  const topCuisine = sortedCuisine.slice(0, 8);
  const restCount = sortedCuisine.slice(8).reduce((n, [, v]) => n + v, 0);
  if (restCount > 0) topCuisine.push(["其他", restCount]);
  const maxCuisine = Math.max(1, ...topCuisine.map(([, v]) => v));

  // ---- 近 6 个月造访 ----
  const now = new Date();
  const months: Array<{ key: string; label: string; count: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABEL[d.getMonth()],
      count: 0,
    });
  }
  const monthByKey = new Map(months.map((m) => [m.key, m]));
  for (const log of logs) {
    const key = log.visited_at.slice(0, 7);
    const m = monthByKey.get(key);
    if (m) m.count += 1;
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  return (
    // V1 时 wrapper 必须在外层：v2.css 规则是 `.ui-v2 .v2-page` 后代选择器
    <div
      className={wrapCls || undefined}
      style={{ flex: 1, display: "flex", flexDirection: "column" }}
    >
    <main className="v2-page" style={{ flex: 1 }}>
      <div className="v2-lhead">
        <Link href="/profile" className="v2-back">
          ‹ 我的
        </Link>
        <div className="row1">
          <h1>吃喝足迹</h1>
        </div>
        <div className="stats">
          <span>你和这些店的故事，都记着呢</span>
        </div>
      </div>

      {/* KPI stat tiles */}
      <div className="v2-kpis">
        <div className="v2-kpi">
          <div className="n">{total}</div>
          <div className="l">收进来的店</div>
        </div>
        <div className="v2-kpi">
          <div className="n">{visited}</div>
          <div className="l">去过的店</div>
        </div>
        <div className="v2-kpi">
          <div className="n">{visitCount}</div>
          <div className="l">造访记录</div>
        </div>
        <div className="v2-kpi">
          <div className="n" style={{ fontSize: 20, paddingTop: 5 }}>
            {favCuisine}
          </div>
          <div className="l">最爱菜系（按造访）</div>
        </div>
      </div>

      {/* 菜系分布：单色横向条形 */}
      <div className="v2-sec" style={{ marginTop: 26 }}>
        <h3>菜系分布</h3>
        <span className="more">{cuisineCount.size} 种</span>
      </div>
      {topCuisine.length === 0 ? (
        <div className="v2-empty" style={{ padding: "28px 20px" }}>
          <div className="s">还没有店——先去加几家</div>
        </div>
      ) : (
        <div className="v2-bars" role="img" aria-label="菜系分布条形图">
          {topCuisine.map(([name, count]) => (
            <div
              className="row"
              key={name}
              title={`${name} · ${count} 家`}
            >
              <span className="lb">{name}</span>
              <span className="track">
                <span
                  className="fill"
                  style={{ width: `${Math.max(4, (count / maxCuisine) * 100)}%` }}
                />
              </span>
              <span className="val">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* 近 6 个月造访：单色柱 */}
      <div className="v2-sec" style={{ marginTop: 26 }}>
        <h3>近 6 个月造访</h3>
        <span className="more">{months.reduce((n, m) => n + m.count, 0)} 次</span>
      </div>
      <div className="v2-cols" role="img" aria-label="近六个月造访次数柱状图">
        {months.map((m) => (
          <div className="col" key={m.key} title={`${m.label} · ${m.count} 次`}>
            <span className="v">{m.count > 0 ? m.count : ""}</span>
            <span className="bar-wrap">
              <span
                className="bar"
                style={{ height: `${Math.max(m.count > 0 ? 8 : 3, (m.count / maxMonth) * 100)}%` }}
              />
            </span>
            <span className="lb">{m.label}</span>
          </div>
        ))}
      </div>
    </main>
    </div>
  );
}
