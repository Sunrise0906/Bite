// Google Places API (New) - REST 调用封装（服务端专用）
//
// 拆两把 key，这个文件只用服务端那把：
//   - getServerApiKey()：优先 GOOGLE_PLACES_SERVER_KEY。服务端请求没有 Referer 头，
//     若复用 NEXT_PUBLIC 那把（生产上加了 HTTP referrer 限制）会被 Google 403，
//     错误信息形如 "Requests from referer <empty> are blocked"。
//     所以服务端 key 必须**不设 referrer 限制**，靠 API restrictions + 预算告警兜底。
//     dev 未设时回退到 NEXT_PUBLIC（dev 用 key 通常未加限制），方便本地跑通。
//   - 浏览器侧那把（NEXT_PUBLIC_GOOGLE_MAPS_API_KEY）由消费方直接读 process.env：
//     实时补全下拉在 components/places/quick-add-input.tsx，地图渲染在 app/(app)/map/page.tsx。
//
// 文档：https://developers.google.com/maps/documentation/places/web-service/overview

const PLACES_BASE = "https://places.googleapis.com/v1";

export function getServerApiKey(): string {
  const serverKey = process.env.GOOGLE_PLACES_SERVER_KEY;
  if (serverKey) return serverKey;
  // 回退：dev / 未拆 key 时用 NEXT_PUBLIC。生产若 NEXT_PUBLIC 加了 referrer 限制，
  // 这里会因没有 Referer 头被 Google 403——错误信息会指向"Requests from referer <empty>"。
  const fallback = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!fallback) {
    throw new Error(
      "缺少 GOOGLE_PLACES_SERVER_KEY（或 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 作为 dev 回退）。",
    );
  }
  return fallback;
}

export type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  /** 米。仅当 autocomplete 请求带 origin 时 Google 返回。 */
  distanceMeters?: number;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  types: string[];
  primaryType: string | null;
  primaryTypeDisplayName: string | null;
  websiteUri: string | null;
};

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails> {
  const fields =
    "id,displayName,formattedAddress,location,types,primaryType,primaryTypeDisplayName,websiteUri";

  const url = new URL(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": getServerApiKey(),
      "X-Goog-FieldMask": fields,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places details ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    types?: string[];
    primaryType?: string;
    primaryTypeDisplayName?: { text?: string };
    websiteUri?: string;
  } = await res.json();

  return {
    placeId: data.id,
    name: data.displayName?.text ?? "",
    formattedAddress: data.formattedAddress ?? "",
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    types: data.types ?? [],
    websiteUri: data.websiteUri ?? null,
    primaryType: data.primaryType ?? null,
    primaryTypeDisplayName: data.primaryTypeDisplayName?.text ?? null,
  };
}

// ---- 找相似（chat 工具用：附近同菜系候选） --------------------------------

export type SimilarPlace = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  ratingCount: number | null;
  priceRange: string | null;
  lat: number | null;
  lng: number | null;
};

const PRICE_LEVEL_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

/**
 * Google Text Search：按文本（菜系等）+ 圆形偏置找附近同类店。
 * best-effort：失败返回空数组。
 */
export async function searchSimilarPlaces(
  textQuery: string,
  center: { lat: number; lng: number } | null,
  radiusMeters = 10000,
): Promise<SimilarPlace[]> {
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getServerApiKey(),
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.location",
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "zh-CN",
        maxResultCount: 8,
        ...(center
          ? {
              locationBias: {
                circle: {
                  center: { latitude: center.lat, longitude: center.lng },
                  radius: radiusMeters,
                },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        priceLevel?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };
    return (data.places ?? [])
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => ({
        placeId: p.id!,
        name: p.displayName!.text!,
        address: p.formattedAddress ?? "",
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        priceRange: p.priceLevel ? (PRICE_LEVEL_MAP[p.priceLevel] ?? null) : null,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
      }));
  } catch {
    return [];
  }
}

// ---- 营业时间（实时信号） -------------------------------------------------

export type OpeningInfo = {
  open_now: boolean | null;
  /** 人话版本周营业时间（Google 本地化文案），今天那条 */
  today: string | null;
};

/**
 * 拉一家店的实时营业状态（决策时刻的高频问题「现在还开着吗」）。
 * best-effort：任何失败返回 null，调用方直接不显示，绝不阻塞页面/聊天。
 */
export async function fetchOpeningInfo(
  placeId: string,
): Promise<OpeningInfo | null> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=zh-CN`,
      {
        headers: {
          "X-Goog-Api-Key": getServerApiKey(),
          "X-Goog-FieldMask":
            "currentOpeningHours.openNow,currentOpeningHours.weekdayDescriptions",
        },
        signal: AbortSignal.timeout(3500),
        // 营业状态短缓存：同一店 5 分钟内复用，省配额
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      currentOpeningHours?: {
        openNow?: boolean;
        weekdayDescriptions?: string[];
      };
    };
    const cur = data.currentOpeningHours;
    if (!cur) return null;
    // weekdayDescriptions 从周一开始。"今天"按店铺所在时区算——app 场景是南加，
    // 用 America/Los_Angeles（服务器在 Vercel 是 UTC，直接 getDay() 傍晚起就会串到明天）
    let today: string | null = null;
    if (cur.weekdayDescriptions?.length === 7) {
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
      }).format(new Date());
      const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const idx = order.indexOf(weekday);
      today = idx >= 0 ? (cur.weekdayDescriptions[idx] ?? null) : null;
    }
    return { open_now: cur.openNow ?? null, today };
  } catch {
    return null;
  }
}

export type GooglePlaceMatch = {
  placeId: string;
  name: string;
  rating: number | null;
  ratingCount: number | null;
  lat: number | null;
  lng: number | null;
  address: string;
  mapsUri: string | null;
  /** 餐厅多为在线点单/菜单页（Toast、Square 等）——「看菜单」直达它 */
  websiteUri: string | null;
};

// 按「店名 + 地址」在 Google 上找到对应店铺，拿评分 / 评价数 / 精确坐标 / 规范地址 /
// 地图链接。用于「Google 口碑丰富」：比模糊 geocoding 准（精确店铺位置）且带评分。
// regionCode=US 偏置（用户的店都在南加）。找不到 / 出错一律 null。
export async function findPlaceOnGoogle(
  query: string,
): Promise<GooglePlaceMatch | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getServerApiKey(),
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.rating,places.userRatingCount,places.location,places.formattedAddress,places.googleMapsUri,places.websiteUri",
      },
      body: JSON.stringify({
        textQuery: q,
        languageCode: "zh-CN",
        regionCode: "US",
        maxResultCount: 1,
      }),
    });
    if (!res.ok) return null;
    const data: {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        rating?: number;
        userRatingCount?: number;
        location?: { latitude?: number; longitude?: number };
        formattedAddress?: string;
        googleMapsUri?: string;
        websiteUri?: string;
      }>;
    } = await res.json();
    const p = data.places?.[0];
    if (!p?.id) return null;
    return {
      placeId: p.id,
      name: p.displayName?.text ?? "",
      rating: typeof p.rating === "number" ? p.rating : null,
      ratingCount:
        typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      address: p.formattedAddress ?? "",
      mapsUri: p.googleMapsUri ?? null,
      websiteUri: p.websiteUri ?? null,
    };
  } catch {
    return null;
  }
}

// 从 Google primaryType / types 推断中文菜系标签
export function inferCuisineFromTypes(
  primaryType: string | null,
  types: string[],
): string[] {
  const out = new Set<string>();
  const all = [primaryType, ...types].filter(Boolean) as string[];

  for (const t of all) {
    switch (t) {
      case "chinese_restaurant":
        out.add("中餐");
        break;
      case "japanese_restaurant":
        out.add("日料");
        break;
      case "korean_restaurant":
        out.add("韩餐");
        break;
      case "italian_restaurant":
        out.add("意餐");
        break;
      case "mexican_restaurant":
        out.add("墨西哥菜");
        break;
      case "thai_restaurant":
        out.add("泰餐");
        break;
      case "vietnamese_restaurant":
        out.add("越南菜");
        break;
      case "indian_restaurant":
        out.add("印度菜");
        break;
      case "french_restaurant":
        out.add("法餐");
        break;
      case "american_restaurant":
        out.add("美式");
        break;
      case "ramen_restaurant":
        out.add("日料");
        out.add("拉面");
        break;
      case "sushi_restaurant":
        out.add("日料");
        out.add("寿司");
        break;
      case "pizza_restaurant":
        out.add("披萨");
        break;
      case "hamburger_restaurant":
        out.add("汉堡");
        break;
      case "barbecue_restaurant":
        out.add("烧烤");
        break;
      case "seafood_restaurant":
        out.add("海鲜");
        break;
      case "steak_house":
        out.add("牛排");
        break;
      case "cafe":
      case "coffee_shop":
        out.add("咖啡");
        break;
      case "bakery":
        out.add("烘焙");
        break;
      case "dessert_restaurant":
      case "dessert_shop":
      case "ice_cream_shop":
        out.add("甜品");
        break;
      case "bar":
      case "pub":
        out.add("酒吧");
        break;
      case "vegan_restaurant":
      case "vegetarian_restaurant":
        out.add("素食");
        break;
    }
  }

  // 兜底
  if (out.size === 0 && all.includes("restaurant")) out.add("餐厅");
  return Array.from(out);
}
