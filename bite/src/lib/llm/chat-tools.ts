// Chat tools — AI 决策 agent 可以调用的查询/写入操作。
// 每个工具返回一个 JSON 字符串结果给模型读。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmTool } from "./types";
import {
  aggregateVisitSignals,
  type VisitLogRow,
  type VisitSignal,
} from "@/lib/visits/aggregate";

export const CHAT_TOOLS: LlmTool[] = [
  {
    name: "search_my_list",
    description:
      "查询当前用户的餐厅库。可按状态 / 菜系 / 价位 / 关键词过滤。" +
      "返回每家店的：name, address, cuisine, price_range, status, tags, reason, notes（AI 备注）、" +
      "visit_count（去过几次）、last_visit（最近一次日期）、last_sentiment（最近一次评价：will_return/okay/wont_return）。" +
      "用于给用户推荐时找候选店——优先推 will_return 的店，避免 wont_return 的店。",
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
      "拿到某家店的完整信息：基础字段 + 最近 10 条 visit logs（date / sentiment / star / note / companions）。" +
      "在 search_my_list 拿到候选后，想深入了解用户最近去得怎么样、点了啥、跟谁去时用。",
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
      "不要在常规推荐里偷偷加。" +
      "返回 ok:true 表示加成功；返回 already_exists:true 表示同 list 同名已存在，没重复加——告诉用户「这家店你已经在该 list 里了」。",
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
    // PostgREST or() 用 , 和 () 分隔，原始 query 含这些字符会破坏过滤语法。
    // 安全做法：剥掉控制字符 + 用 % 通配。% 和 _ 是 LIKE 通配符，本来就当 fuzzy 用。
    const t = args.query
      .trim()
      .replace(/[,()\\*]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 80);
    if (t) {
      q = q.or(
        `name.ilike.%${t}%,address.ilike.%${t}%,notes.ilike.%${t}%`,
      );
    }
  }

  const { data, error } = await q.limit(limit);
  if (error) return { error: `查询失败：${error.message}` };

  const rows = data ?? [];
  // 一次拿所有候选店的 visit signals（last sentiment + visit count），减少回数
  const placeIds = rows.map((p) => p.id);
  const visitsByPlace = await summarizeVisits(ctx, placeIds);

  const places = rows.map((p) => {
    const v = visitsByPlace.get(p.id);
    return {
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
      visit_count: v?.count ?? 0,
      last_visit: v?.last_visit ?? null,
      last_sentiment: v?.last_sentiment ?? null,
    };
  });

  return { count: places.length, places };
}

// 一次性算多个 place 的 visit 信号
async function summarizeVisits(
  ctx: ToolContext,
  placeIds: string[],
): Promise<Map<string, VisitSignal>> {
  if (placeIds.length === 0) return new Map();

  const { data } = await ctx.supabase
    .from("visit_logs")
    .select("place_id, visited_at, sentiment")
    .in("place_id", placeIds)
    .order("visited_at", { ascending: false });

  // 共用 /lists 页同一份聚合纯函数（这里不查 star_rating，avg_star 恒 null，本工具也不用）
  return aggregateVisitSignals((data ?? []) as VisitLogRow[]);
}

type DetailsInput = { place_id?: string };

async function checkPlaceDetails(input: unknown, ctx: ToolContext) {
  const args = (input ?? {}) as DetailsInput;
  if (!args.place_id) return { error: "缺少 place_id" };

  const [{ data, error }, { data: logs }] = await Promise.all([
    ctx.supabase.from("places").select("*").eq("id", args.place_id).maybeSingle(),
    ctx.supabase
      .from("visit_logs")
      .select("visited_at, sentiment, star_rating, note, companions")
      .eq("place_id", args.place_id)
      .order("visited_at", { ascending: false })
      .limit(10),
  ]);

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
    visits: (logs ?? []).map((l) => ({
      date: typeof l.visited_at === "string" ? l.visited_at.slice(0, 10) : null,
      sentiment: l.sentiment,
      star: l.star_rating,
      note: l.note,
      companions: l.companions,
    })),
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

  // 防 dup：同 list 同名已存在 → 不重复插，告诉 AI 让 ta 告知用户
  const { data: existing } = await ctx.supabase
    .from("places")
    .select("id, name")
    .eq("list_id", args.list_id)
    .eq("name", args.name)
    .maybeSingle<{ id: string; name: string }>();
  if (existing) {
    return {
      already_exists: true,
      place_id: existing.id,
      name: existing.name,
      note: "这家店已经在该 list 里了，没有重复添加。告诉用户。",
    };
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
