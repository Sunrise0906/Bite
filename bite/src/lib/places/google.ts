// Google Places API (New) - REST 调用封装
// 既可在浏览器（autocomplete 实时下拉），也可在服务端（details 拉取详情）调用。
// 同一个 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 两侧通用，前提：
//   - 浏览器侧依赖 HTTP referrer 限制（Google Cloud 控制台可设）
//   - 服务端调用没有 referrer，因此 key 必须**没设严格 referrer 限制**，
//     或额外创建一个仅 IP/无限制的服务端专用 key（生产建议）
//
// 文档：https://developers.google.com/maps/documentation/places/web-service/place-autocomplete

const PLACES_BASE = "https://places.googleapis.com/v1";

function getApiKey(): string {
  const k = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!k) {
    throw new Error(
      "缺少 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 环境变量。请在 .env.local 中填入。",
    );
  }
  return k;
}

export type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
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

const AUTOCOMPLETE_FOOD_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "bakery",
  "meal_takeaway",
  "meal_delivery",
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

  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
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
      "X-Goog-Api-Key": getApiKey(),
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
