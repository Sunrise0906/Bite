import { createClient, requireUser } from "@/lib/supabase/server";
import { PlacesMap } from "@/components/map/places-map";
import { AlertIcon } from "@/components/ui/icons";
import { getUiVersion } from "@/lib/ui-version";
import { BackfillCoordsButton } from "@/components/v2/backfill-coords-button";

export const metadata = {
  title: "地图 · Bite",
};

type MapPlaceRow = {
  id: string;
  list_id: string;
  name: string;
  lat: number;
  lng: number;
  status: "want_to_go" | "visited" | "archived";
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

  let places: MapPlaceRow[] = [];
  let missingCoords = 0;
  if (listIds.length > 0) {
    const { data } = await supabase
      .from("places")
      .select("id, list_id, name, lat, lng, status")
      .in("list_id", listIds)
      .not("lat", "is", null)
      .not("lng", "is", null);
    places = (data ?? []) as MapPlaceRow[];

    // 有地址但没坐标的店数量（可一键补坐标上图）
    const { count } = await supabase
      .from("places")
      .select("id", { count: "exact", head: true })
      .in("list_id", listIds)
      .is("lat", null)
      .not("address", "is", null)
      .neq("address", "");
    missingCoords = count ?? 0;
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  if ((await getUiVersion()) === "v2") {
    return (
      <main className="v2-page">
        <div className="v2-lhead" style={{ paddingBottom: 14 }}>
          <h1>地图</h1>
          <div className="stats">
            {places.length > 0
              ? `${places.length} 家有坐标 · 点圆点看详情`
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
            <div className="t">地图还是空的</div>
            <div className="s" style={{ marginBottom: 16 }}>
              {missingCoords > 0
                ? "你有些店只有文字地址、没坐标。一键补上就能标到地图。"
                : "加店时用 Google 搜索会自动带坐标。"}
            </div>
            {missingCoords > 0 && <BackfillCoordsButton missing={missingCoords} />}
          </div>
        ) : (
          <>
            <PlacesMap places={places} apiKey={apiKey} />
            {missingCoords > 0 && (
              <div style={{ marginTop: 14 }}>
                <BackfillCoordsButton missing={missingCoords} />
              </div>
            )}
          </>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-7 sm:py-10">
      <header className="mb-8">
        <h1 className="heading-display text-3xl sm:text-4xl">地图</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {places.length > 0
            ? `${places.length} 家有坐标 · 点圆点看详情`
            : "还没有带坐标的店"}
        </p>
      </header>

      {!apiKey ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <AlertIcon size={28} className="text-[var(--gold)]" />
          <p className="text-sm text-[var(--text-default)]">
            缺少 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 环境变量，地图无法加载。
          </p>
        </div>
      ) : (
        <PlacesMap places={places} apiKey={apiKey} />
      )}
    </main>
  );
}
