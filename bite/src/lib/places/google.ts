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
