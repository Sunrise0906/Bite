import { createClient, requireUser } from "@/lib/supabase/server";
import { PlacesMap } from "@/components/map/places-map";

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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-5">
        <h1 className="heading-display text-3xl sm:text-4xl">地图</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {places.length > 0
            ? `${places.length} 家有坐标 · 点圆点看详情`
            : "还没有带坐标的店"}
        </p>
      </header>

      {!apiKey ? (
        <div className="card px-6 py-10 text-center text-sm text-zinc-600">
          ⚠ 缺少 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 环境变量，地图无法加载。
        </div>
      ) : (
        <PlacesMap places={places} apiKey={apiKey} />
      )}
    </main>
  );
}
