import { createClient, requireUser } from "@/lib/supabase/server";
import { NearbyView, type NearbyPlace } from "@/components/map/nearby-view";
import { AlertIcon } from "@/components/ui/icons";
import { EnrichButton } from "@/components/v2/enrich-button";

export const metadata = {
  title: "附近去哪 · Bite",
};

export default async function MapPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // 拿用户所有 list ids
  const { data: ownerLists } = await supabase
    .from("lists")
    .select("id")
    .eq("owner_id", user.id);
  const { data: memberLists } = await supabase
    .from("list_members")
    .select("list_id")
    .eq("user_id", user.id);
  const listIds = [
    ...(ownerLists ?? []).map((l) => l.id),
    ...(memberLists ?? []).map((m) => m.list_id),
  ];

  let places: NearbyPlace[] = [];
  let needEnrich = 0;
  if (listIds.length > 0) {
    const { data } = await supabase
      .from("places")
      .select(
        "id, list_id, name, address, lat, lng, status, cuisine, price_range, google_rating, website_uri",
      )
      .in("list_id", listIds)
      .not("lat", "is", null)
      .not("lng", "is", null);
    places = (data ?? []) as NearbyPlace[];

    // 待丰富的店数量。这里的过滤条件必须和 enrichPlacesFromGoogle 里的一致，
    // 否则按钮上写「1 家」、点下去却处理了 5 家（之前就是这样：这里只数缺评分的，
    // 而那边缺评分**或**缺菜单链接都算）
    const { count } = await supabase
      .from("places")
      .select("id", { count: "exact", head: true })
      .in("list_id", listIds)
      .or("google_rating.is.null,website_uri.is.null");
    needEnrich = count ?? 0;
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <main className="v2-page">
      <div className="v2-lhead" style={{ paddingBottom: 14 }}>
        <h1>附近去哪</h1>
        <div className="stats">
          {places.length > 0
            ? `${places.length} 家有坐标 · 按离你的距离排`
            : "还没有带坐标的店"}
        </div>
      </div>
      {!apiKey ? (
        <div className="v2-empty">
          <AlertIcon size={28} className="text-[var(--v2-gold)]" />
          <div className="t">地图无法加载</div>
          <div className="s">缺少 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 环境变量</div>
        </div>
      ) : places.length === 0 ? (
        <div className="v2-empty">
          <div className="t">还没有能上地图的店</div>
          <div className="s" style={{ marginBottom: 16 }}>
            {needEnrich > 0
              ? "在 Google 上找到你的店，就能拿到坐标和评分，按距离排给你。"
              : "加店时用 Google 搜索会自动带坐标。"}
          </div>
          {needEnrich > 0 && <EnrichButton count={needEnrich} />}
        </div>
      ) : (
        <>
          <NearbyView places={places} apiKey={apiKey} />
          {needEnrich > 0 && (
            <div style={{ marginTop: 14 }}>
              <EnrichButton count={needEnrich} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
