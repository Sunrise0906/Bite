import { createClient, requireUser } from "@/lib/supabase/server";
import { PlacesMap } from "@/components/map/places-map";
import { AlertIcon } from "@/components/ui/icons";
import { getUiVersion } from "@/lib/ui-version";

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
  if (listIds.length > 0) {
    const { data } = await supabase
      .from("places")
      .select("id, list_id, name, lat, lng, status")
      .in("list_id", listIds)
      .not("lat", "is", null)
      .not("lng", "is", null);
    places = (data ?? []) as MapPlaceRow[];
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
        ) : (
          <PlacesMap places={places} apiKey={apiKey} />
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
