import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./client";

// Phase 2 默认提取模型 —— Haiku 4.5 经济快速，结构化提取场景足够。
// Phase 3 多模型抽象时这里会被切到 provider router。
const EXTRACTION_MODEL = "claude-haiku-4-5";

// ============================== Schema ==============================

const PlaceItemSchema = z.object({
  name: z.string().describe("餐厅名"),
  address: z.string().describe("地址，至少给出大致区域，如 'Irvine' 或 '罗兰岗'"),
  cuisine: z.array(z.string()).describe("菜系数组，至少 1 个"),
  price_range: z
    .enum(["$", "$$", "$$$", "$$$$"])
    .optional()
    .describe("人均价位，仅当原文明确人均时填"),
  status: z
    .enum(["want_to_go", "visited", "archived"])
    .optional()
    .describe("默认 want_to_go，过去时态时为 visited"),
  occasions: z
    .array(z.string())
    .optional()
    .describe("适合场合：约会、聚会、招待长辈等"),
  recommended_by: z
    .string()
    .optional()
    .describe("推荐来源：朋友、XHS博主、@小李、自己"),
  tags: z
    .array(z.string())
    .optional()
    .describe("其他显著特征：排队长、有露台、可带宠物"),
  reason: z.string().optional().describe("用户想去 / 评价理由，一句话概括"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("提取信心：high 全部直接来自原文，low 大量推测"),
  notes: z
    .string()
    .optional()
    .describe(
      "AI 综合判断（写给未来的自己 / 决策 agent 看）。综合帖子正文、" +
        "评论区、标签等信号，1-3 句话。包含但不限于：评论区是否有差评、" +
        "排队 / 位置 / 性价比 / 营业时间等客观提醒、信息缺失项。",
    ),
});

export type ExtractedPlace = z.infer<typeof PlaceItemSchema>;

const ExtractionResultSchema = z.object({
  mode: z
    .enum(["single", "compilation"])
    .describe(
      "single = 帖子主要讲一家店；compilation = 合集帖（如'X 选'、'探店月报'）",
    ),
  places: z
    .array(PlaceItemSchema)
    .describe("提取的店铺数组。single 时长度 1；compilation 时 ≥2，建议 ≤10"),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ============================== Prompt ==============================

const SYSTEM_PROMPT = `你是一个餐厅信息提取助手。从用户输入的中文文本中提取餐厅结构化信息。

【输入类型】
- 简短描述："罗兰岗的老北京炸酱面"
- 自由文字："朋友推荐了一家叫海底捞的，在 Irvine Spectrum，火锅，人均 40"
- 小红书帖子（单店）：博主重点夸一家店
- 小红书合集帖：一篇里探多家店，每家一个段落

【单店帖 vs 合集帖】（很重要）
- 默认 mode = "single"，places 长度 1
- 合集帖信号（满足任意一条就 compilation）：
  - 标题含 "X 选 / 月报 / 必吃 / 宝藏 / 美食合集 / 探店日记" 等关键词
  - 正文按 "图1️⃣ 图2️⃣ / 1.XX 2.YY / ★ 店名 / 数字 emoji" 等明显分段，每段对应不同店
  - 文中明确出现 ≥2 家独立店名 + 各自描述
- 合集帖时 mode = "compilation"，每家店一个 places 元素：
  - name/cuisine/reason/notes 等都独立填，只引用该段落里的信息
  - confidence 按每家店各自的信息量评，信息少的可以 medium / low
  - **建议最多 10 家**；超过就只取最重要的前 10 家
- 单店帖里的对比店（"这家比 ABC 难吃"）不算独立条目，在 notes 里提一下
- 评论区里别人推荐的店（如 "@A：我推 XXX 也好吃"），信息够（至少 name + cuisine 或 address 信号）也作为独立 places 元素，notes 里写 "评论区 @某用户 推荐"

【每个 places 元素的字段规则】
- name：餐厅名（必填）
- address：地址（必填，至少给出大致区域，如 "Irvine" 或 "罗兰岗"；原文模糊时给最具体的可推断范围）
- cuisine：菜系数组（必填，至少 1 个）。常见值：中餐、川菜、粤菜、火锅、面食、日料、寿司、拉面、韩餐、烧烤、咖啡、甜品、烘焙、美式、墨西哥菜、越南菜、泰餐、台菜、上海菜
- price_range：人均价位
  - "$" = < $15  /  "$$" = $15-30  /  "$$$" = $30-60  /  "$$$$" = > $60
  仅当文中明确人均数字时填；不明确就**省略**，不要瞎猜
- status：默认 "want_to_go"；过去时态时 "visited"
- occasions：适合场合（"约会"、"聚会"、"招待长辈"、"快餐"、"工作日午餐"）
- recommended_by：推荐来源（"朋友"、"XHS博主"、"@小李"、"自己"）。粘贴小红书帖子默认 "XHS博主"
- tags：其他显著特征（"排队长"、"有露台"、"环境好"、"可带宠物"、"开车 40 分钟"、"等位 4 小时"）
- reason：用户的想去 / 评价理由，一句话保留原文味道，不超过 30 字
- confidence：
  - "high"：name + address + cuisine 都能直接从原文/段落提取
  - "medium"：推断了 1-2 个必填字段
  - "low"：缺关键信息或大量推测
- notes：**总是写**，作为这家店的"AI 备注"持久保存到数据库，给未来决策 agent 用。1-3 句话综合判断，按重要性排序：
  1. 评论区与帖子的口碑分歧（如"博主吹爆但评论 3/8 说排队 1 小时、味道一般"）
  2. 客观提醒（排队 / 营业时间 / 位置偏 / 限量供应 / 性价比）
  3. 缺失字段说明（如"原文没说地址，按上下文猜测在 Irvine"）
  4. 信号源（如"博主合集中第 2 家"、"评论区 @某用户 推荐"）
  即使信息齐全且评论正面，也写一句客观总结

【小红书风格特殊处理】
- 忽略 emoji、hashtag（如 #Irvine美食）、博主话术（如"姐妹们冲！"、"yyds"、"绝绝子"）
- 关注真正传递信息的句子
- 📍emoji 后面通常是地址；hashtag 末尾 #xx菜 是菜系信号
- 帖子标签（如 "GardenGrove美食"、"OC越南区"）常直接是地址/菜系信号
- 博主 IP 属地和真实地址不一定一致，仅作辅助

【输出】
严格按 JSON schema 输出 { mode, places: [...] }。不要写 markdown 包裹、不要解释。`;

const FEW_SHOTS: Array<{ user: string; assistant: ExtractionResult }> = [
  {
    user: "罗兰岗的老北京炸酱面，朋友推荐说很解馋，开车 40 分钟",
    assistant: {
      mode: "single",
      places: [
        {
          name: "老北京炸酱面",
          address: "罗兰岗",
          cuisine: ["中餐", "面食"],
          recommended_by: "朋友",
          reason: "解馋",
          tags: ["开车 40 分钟"],
          confidence: "high",
          notes:
            "朋友推荐，仅一句话信息。位置远（开车 40 分钟），适合周末或专程去。",
        },
      ],
    },
  },
  {
    user: `帖子标题：Capital Seafood 真的好好吃！
帖子正文：粤式茶点 + 海鲜，人均 25 刀，环境好。位置：Diamond Jamboree。
【评论区前 3 条】
#1 @user1：上周去了，等位 1.5h 才入座 😅
#2 @user2：味道还行，但服务一般
#3 @user3：可以可以，下次还来`,
    assistant: {
      mode: "single",
      places: [
        {
          name: "Capital Seafood",
          address: "Diamond Jamboree",
          cuisine: ["中餐", "粤菜", "海鲜"],
          price_range: "$$",
          tags: ["茶点", "环境好"],
          recommended_by: "XHS博主",
          reason: "好好吃，粤式茶点 + 海鲜",
          confidence: "high",
          notes:
            "博主主推味道和环境，但评论区有分歧：1 条提到等位 1.5 小时，1 条说服务一般。去之前最好错峰或预约。",
        },
      ],
    },
  },
  {
    user: `帖子标题：尔湾｜四月治愈我的美食
博主：@xxx
帖子标签：尔湾美食、尔湾探店
帖子正文：
图1️⃣-2️⃣：上水小馆 - 粤菜馆，炒饭烧鸭都好吃，分量大，没吃完打包

图3️⃣-4️⃣：凯悦轩 - 早茶，等位 20min，龙虾乌冬面性价比高

图5️⃣-7️⃣：鼎泰丰 Spectrum - 周五 5pm 加 waitlist 9pm 才到，麻酱小面好吃，芋泥小笼包偏腻`,
    assistant: {
      mode: "compilation",
      places: [
        {
          name: "上水小馆",
          address: "尔湾",
          cuisine: ["中餐", "粤菜"],
          recommended_by: "XHS博主",
          reason: "炒饭烧鸭都好吃",
          tags: ["分量大"],
          confidence: "high",
          notes:
            "博主四月探店合集第 1 家。主推炒饭和烧鸭，分量大可打包。",
        },
        {
          name: "凯悦轩",
          address: "尔湾",
          cuisine: ["中餐", "粤菜", "早茶"],
          recommended_by: "XHS博主",
          reason: "龙虾乌冬面性价比高",
          tags: ["等位 20min"],
          confidence: "high",
          notes:
            "博主合集第 2 家。早茶单价偏高但分量大；周末通常等位约 20 分钟。",
        },
        {
          name: "鼎泰丰",
          address: "Irvine Spectrum",
          cuisine: ["台菜", "小笼包"],
          recommended_by: "XHS博主",
          reason: "麻酱小面好吃",
          tags: ["等位 4 小时"],
          confidence: "high",
          notes:
            "博主合集第 3 家，Spectrum 新开。周五 5pm waitlist 排到 9pm 才入座；芋泥小笼包偏腻不推荐。",
        },
      ],
    },
  },
  {
    user: "上次和女朋友去的那家寿司，太赞了",
    assistant: {
      mode: "single",
      places: [
        {
          name: "（未知）",
          address: "（未知）",
          cuisine: ["日料", "寿司"],
          status: "visited",
          reason: "太赞了",
          confidence: "low",
          notes: "原文没提到餐厅名和地址，需要你补充。无更多评价细节。",
        },
      ],
    },
  },
];

// ============================== API ==============================

export type ExtractResult =
  | {
      ok: true;
      mode: "single" | "compilation";
      places: ExtractedPlace[];
    }
  | { ok: false; error: string };

export async function extractPlacesFromText(
  text: string,
): Promise<ExtractResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "请输入要识别的内容" };
  if (trimmed.length > 10000)
    return { ok: false, error: "文本过长，超过 10000 字" };

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI 客户端初始化失败",
    };
  }

  try {
    const response = await client.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...FEW_SHOTS.flatMap((ex) => [
          { role: "user" as const, content: ex.user },
          {
            role: "assistant" as const,
            content: JSON.stringify(ex.assistant),
          },
        ]),
        { role: "user", content: trimmed },
      ],
      output_config: {
        format: zodOutputFormat(ExtractionResultSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed || !parsed.places || parsed.places.length === 0) {
      return { ok: false, error: "AI 未返回有效结构化结果，请重试或换种描述" };
    }

    // 安全上限：超过 10 家截断
    const places = parsed.places.slice(0, 10);

    return { ok: true, mode: parsed.mode, places };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "AI 服务繁忙，请稍后再试" };
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "AI 凭据无效，请检查 ANTHROPIC_API_KEY" };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `AI 解析失败：${err.message}` };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI 解析失败",
    };
  }
}

/** @deprecated 用 extractPlacesFromText 替换 */
export async function extractPlaceFromText(text: string): Promise<
  | { ok: true; data: ExtractedPlace }
  | { ok: false; error: string }
> {
  const r = await extractPlacesFromText(text);
  if (!r.ok) return r;
  return { ok: true, data: r.places[0] };
}
