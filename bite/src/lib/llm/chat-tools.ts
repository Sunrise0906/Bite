// Chat tools — AI 决策 agent 可以调用的查询/写入操作。
// 每个工具返回一个 JSON 字符串结果给模型读。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmTool } from "./types";

export const CHAT_TOOLS: LlmTool[] = [
  {
    name: "search_my_list",
    description:
      "查询当前用户的餐厅库。可按状态 / 菜系 / 价位 / 关键词过滤。" +
      "返回 name, address, cuisine, price_range, status, tags, reason, notes（AI 备注）。" +
      "用于给用户推荐时找候选店。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "可选关键词，匹配店名 / 地址 / 标签 / notes / reasons。留空 = 不按文本筛",
        },
        status: {
          type: "string",
          enum: ["want_to_go", "visited", "archived"],
          description: "可选状态过滤",
        },
        cuisine: {
          type: "array",
          items: { type: "string" },
          description: "可选菜系数组（OR 匹配，任一即可）",
        },
        price_range: {
          type: "array",
          items: { type: "string", enum: ["$", "$$", "$$$", "$$$$"] },
          description: "可选价位数组（OR 匹配）",
        },
        limit: {
          type: "number",
          description: "返回数量上限，默认 10，最多 30",
        },
      },
      required: [],
    },
  },
  {
    name: "check_place_details",
    description:
      "拿到某家店的完整信息（name, address, all photos, all reasons, full notes, occasions, tags, lat/lng）。" +
      "在 search_my_list 拿到候选后，需要深入了解某家店时用。",
    inputSchema: {
      type: "object",
      properties: {
        place_id: { type: "string", description: "place 的 uuid" },
      },
      required: ["place_id"],
    },
  },
  {
    name: "add_to_list",
    description:
      "把一家用户库外的店加进某个 list（想去）。仅在用户明确说'帮我加上' / '记一下' 时用。" +
      "不要在常规推荐里偷偷加。",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string", description: "目标 list 的 uuid" },
        name: { type: "string" },
        address: { type: "string" },
        cuisine: { type: "array", items: { type: "string" } },
        price_range: {
          type: "string",
          enum: ["$", "$$", "$$$", "$$$$"],
        },
        reason: { type: "string", description: "为什么加" },
        notes: { type: "string", description: "AI 备注（可选）" },
      },
      required: ["list_id", "name", "address", "cuisine"],
    },
  },
];

// ============================== Execute ==============================

type ToolContext = {
  userId: string;
  supabase: SupabaseClient;
};

export async function executeChatTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case "search_my_list":
        return JSON.stringify(await searchMyList(input, ctx));
      case "check_place_details":
        return JSON.stringify(await checkPlaceDetails(input, ctx));
      case "add_to_list":
        return JSON.stringify(await addToList(input, ctx));
      default:
        return JSON.stringify({
          error: `未知工具：${name}`,
        });
    }
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================== Implementations ==============================

type SearchInput = {
  query?: string;
  status?: "want_to_go" | "visited" | "archived";
  cuisine?: string[];
  price_range?: Array<"$" | "$$" | "$$$" | "$$$$">;
  limit?: number;
};

async function searchMyList(input: unknown, ctx: ToolContext) {
  const args = (input ?? {}) as SearchInput;
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 30);

  // 先拿用户所有 list ids（owner 或 member）
  const { data: ownerLists } = await ctx.supabase
    .from("lists")
    .select("id")
    .eq("owner_id", ctx.userId);
  const { data: memberLists } = await ctx.supabase
    .from("list_members")
    .select("list_id")
    .eq("user_id", ctx.userId);

  const listIds = [
    ...(ownerLists ?? []).map((l) => l.id),
    ...(memberLists ?? []).map((m) => m.list_id),
  ];

  if (listIds.length === 0) {
    return { places: [], note: "用户还没有任何 list" };
  }

  let q = ctx.supabase
    .from("places")
    .select(
      "id, list_id, name, address, cuisine, price_range, status, tags, occasions, reasons, notes, photo_urls",
    )
    .in("list_id", listIds);

  if (args.status) q = q.eq("status", args.status);
  if (args.cuisine && args.cuisine.length > 0) q = q.overlaps("cuisine", args.cuisine);
  if (args.price_range && args.price_range.length > 0)
    q = q.in("price_range", args.price_range);
  if (args.query && args.query.trim()) {
    const t = args.query.trim();
    // 简单模糊匹配几个文本字段
    q = q.or(
      `name.ilike.%${t}%,address.ilike.%${t}%,notes.ilike.%${t}%`,
    );
  }

  const { data, error } = await q.limit(limit);
  if (error) return { error: `查询失败：${error.message}` };

  // 把 reasons 压缩成 text 数组（只取当前用户能看见的）
  const places = (data ?? []).map((p) => ({
    id: p.id,
    list_id: p.list_id,
    name: p.name,
    address: p.address,
    cuisine: p.cuisine,
    price_range: p.price_range,
    status: p.status,
    tags: p.tags ?? [],
    occasions: p.occasions ?? [],
    reasons: (p.reasons ?? []).map((r: { text: string }) => r.text),
    notes: p.notes,
    has_photos: (p.photo_urls ?? []).length > 0,
  }));

  return { count: places.length, places };
}

type DetailsInput = { place_id?: string };

async function checkPlaceDetails(input: unknown, ctx: ToolContext) {
  const args = (input ?? {}) as DetailsInput;
  if (!args.place_id) return { error: "缺少 place_id" };

  const { data, error } = await ctx.supabase
    .from("places")
    .select("*")
    .eq("id", args.place_id)
    .maybeSingle();

  if (error) return { error: `查询失败：${error.message}` };
  if (!data) return { error: "找不到这家店" };

  return {
    id: data.id,
    list_id: data.list_id,
    name: data.name,
    address: data.address,
    cuisine: data.cuisine,
    price_range: data.price_range,
    status: data.status,
    tags: data.tags ?? [],
    occasions: data.occasions ?? [],
    reasons: (data.reasons ?? []).map((r: { text: string }) => r.text),
    recommended_by: data.recommended_by,
    notes: data.notes,
    source: data.source,
    source_url: data.source_url,
    lat: data.lat,
    lng: data.lng,
    photo_count: (data.photo_urls ?? []).length,
  };
}

type AddInput = {
  list_id?: string;
  name?: string;
  address?: string;
  cuisine?: string[];
  price_range?: "$" | "$$" | "$$$" | "$$$$";
  reason?: string;
  notes?: string;
};

async function addToList(input: unknown, ctx: ToolContext) {
  const args = (input ?? {}) as AddInput;
  if (!args.list_id || !args.name || !args.address || !args.cuisine?.length) {
    return { error: "缺少必填字段（list_id / name / address / cuisine）" };
  }

  const reasons = args.reason
    ? [{ user_id: ctx.userId, text: args.reason }]
    : [];

  const { data, error } = await ctx.supabase
    .from("places")
    .insert({
      list_id: args.list_id,
      name: args.name,
      address: args.address,
      cuisine: args.cuisine,
      price_range: args.price_range ?? null,
      status: "want_to_go",
      reasons,
      notes: args.notes ?? null,
      source: "ai_extract",
      created_by: ctx.userId,
    })
    .select("id, name")
    .single();

  if (error) return { error: `添加失败：${error.message}` };
  return { ok: true, place_id: data.id, name: data.name };
}
