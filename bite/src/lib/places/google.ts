// Google Places API (New) - REST 调用封装
// 拆两把 key：
//   - getClientApiKey(): NEXT_PUBLIC_GOOGLE_MAPS_API_KEY，浏览器侧（autocomplete 实时下拉、地图渲染）。
//     生产建议在 GCP 加 HTTP referrer 限制（白名单本站域名 + localhost）防盗刷。
//   - getServerApiKey(): 优先 GOOGLE_PLACES_SERVER_KEY，仅服务端用（fetchPlaceDetails 等）。
//     服务端请求没有 Referer 头，若 NEXT_PUBLIC 的 key 加了 referrer 限制，复用会被 403。
//     因此服务端 key 应**不设 referrer 限制**，靠 API restrictions + 预算告警兜底。
//     dev 阶段未设 GOOGLE_PLACES_SERVER_KEY 时回退到 NEXT_PUBLIC（dev 用 key 通常未加限制），方便本地跑通。
//
// 文档：https://developers.google.com/maps/documentation/places/web-service/place-autocomplete

const PLACES_BASE = "https://places.googleapis.com/v1";

export function getClientApiKey(): string {
  const k = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!k) {
    throw new Error(
      "缺少 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 环境变量。请在 .env.local 中填入。",
    );
  }
  return k;
}

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
};

// Google Places API 限制最多 5 个 included_primary_types
const AUTOCOMPLETE_FOOD_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "bakery",
  "meal_takeaway",
];

export async function autocompletePlace(
  input: string,
  sessionToken: string,
  options?: { signal?: AbortSignal; latitude?: number; longitude?: number },
): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = {
    input,
    sessionToken,
    languageCode: "zh-CN",
    includedPrimaryTypes: AUTOCOMPLETE_FOOD_TYPES,
  };

  if (
    options?.latitude !== undefined &&
    options?.longitude !== undefined
  ) {
    body.locationBias = {
      circle: {
        center: { latitude: options.latitude, longitude: options.longitude },
        radius: 30000,
      },
    };
  }

  // 注意：此服务端 autocompletePlace 当前没有任何调用方（浏览器侧 autocomplete 由
  // src/components/places/quick-add-input.tsx 直接打 Google）。如果将来要从 server action
  // 触发 autocomplete，用 server key（无 referrer 限制）。
  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getServerApiKey(),
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places autocomplete ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: {
    suggestions?: Array<{
      placePrediction?: {
        placeId: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  } = await res.json();

  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails> {
  const fields =
    "id,displayName,formattedAddress,location,types,primaryType,primaryTypeDisplayName";

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
  } = await res.json();

  return {
    placeId: data.id,
    name: data.displayName?.text ?? "",
    formattedAddress: data.formattedAddress ?? "",
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    types: data.types ?? [],
    primaryType: data.primaryType ?? null,
    primaryTypeDisplayName: data.primaryTypeDisplayName?.text ?? null,
  };
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
          "places.id,places.displayName,places.rating,places.userRatingCount,places.location,places.formattedAddress,places.googleMapsUri",
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
    };
  } catch {
    return null;
  }
}

// 地址 → 经纬度（Geocoding API，服务端 key）。用于给只有文字地址、没坐标的店补坐标，
// 让它们能上地图。模糊地址（"尔湾"）会返回城市级坐标——够把 pin 放上去。
// 需要 server key 启用 Geocoding API；失败/无结果一律返回 null（不抛，调用方跳过即可）。
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const a = address.trim();
  if (!a) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", a);
    url.searchParams.set("key", getServerApiKey());
    url.searchParams.set("language", "zh-CN");
    // 限定美国：用户的店都在南加州，模糊中文地址（"尔湾"/"罗兰岗"）不限定会被
    // 歧义解析到中国。如果将来有非美国的店，再放开这条。
    url.searchParams.set("components", "country:US");
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    } = await res.json();
    const loc = data.results?.[0]?.geometry?.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
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
