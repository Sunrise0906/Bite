import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropicClient } from "./client";

// Phase 2 默认提取模型 —— Haiku 4.5 经济快速，结构化提取场景足够。
// Phase 3 多模型抽象时这里会被切到 provider router。
const EXTRACTION_MODEL = "claude-haiku-4-5";

export const ExtractedPlaceSchema = z.object({
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
    .describe("提示用户的信息缺失或不确定项"),
});

export type ExtractedPlace = z.infer<typeof ExtractedPlaceSchema>;

const SYSTEM_PROMPT = `你是一个餐厅信息提取助手。从用户输入的中文文本中提取餐厅结构化信息。

【输入类型】
- 简短描述："罗兰岗的老北京炸酱面"
- 自由文字："朋友推荐了一家叫海底捞的，在 Irvine Spectrum，火锅，人均 40"
- 小红书帖子粘贴：含 emoji、博主语气、hashtag

【字段规则】
- name：餐厅名（必填）
- address：地址（必填，至少给出大致区域，如 "Irvine" 或 "罗兰岗"；原文模糊时给最具体的可推断范围）
- cuisine：菜系数组（必填，至少 1 个）。常见值：中餐、川菜、粤菜、火锅、面食、日料、寿司、拉面、韩餐、烧烤、咖啡、甜品、烘焙、美式、墨西哥菜、越南菜、泰餐
- price_range：人均价位
  - "$" = 人均 < $15
  - "$$" = $15-30
  - "$$$" = $30-60
  - "$$$$" = > $60
  仅当文中明确人均数字时填；不明确就**省略这个字段**，不要瞎猜。
- status：默认 "want_to_go"；说"去过"、"上次"、"那天"、"吃过"等过去时态时设为 "visited"
- occasions：适合场合，从原文显式或强暗示提取（"约会"、"聚会"、"招待长辈"、"快餐"、"工作日午餐"）
- recommended_by：推荐来源（"朋友"、"XHS博主"、"@小李"、"自己"）。粘贴小红书帖子默认设为 "XHS博主"。
- tags：其他显著特征（"排队长"、"有露台"、"环境好"、"可带宠物"、"开车 40 分钟"）
- reason：用户的想去 / 评价理由，一句话保留原文味道。不超过 30 字。
- confidence：
  - "high"：name + address + cuisine 都能直接从原文提取
  - "medium"：name 在但 address 或 cuisine 推断而来
  - "low"：缺关键信息或大量推测
- notes：仅在 confidence != high 时填，告诉用户哪些信息是推测的（如 "原文没说地址，按上下文猜测在 Irvine"）

【小红书风格特殊处理】
- 忽略 emoji、hashtag（如 #Irvine美食）、博主话术（如"姐妹们冲！"、"yyds"、"绝绝子"）
- 关注真正传递信息的句子
- 📍emoji 后面通常是地址；通常 hashtag 末尾的 #xx菜 是菜系信号

【输出】
严格按 JSON schema 输出。不要写 markdown 包裹、不要解释、只返回 JSON 对象。`;

const FEW_SHOTS: Array<{ user: string; assistant: ExtractedPlace }> = [
  {
    user: "罗兰岗的老北京炸酱面，朋友推荐说很解馋，开车 40 分钟",
    assistant: {
      name: "老北京炸酱面",
      address: "罗兰岗",
      cuisine: ["中餐", "面食"],
      recommended_by: "朋友",
      reason: "解馋",
      tags: ["开车 40 分钟"],
      confidence: "high",
    },
  },
  {
    user: "海底捞 Irvine Spectrum 那家，人均 50，火锅，聚会能用",
    assistant: {
      name: "海底捞",
      address: "Irvine Spectrum",
      cuisine: ["中餐", "火锅"],
      price_range: "$$$",
      occasions: ["聚会"],
      confidence: "high",
    },
  },
  {
    user: "🔥救命好好吃！\n📍Capital Seafood @ Diamond Jamboree\n粤式茶点 + 海鲜，人均 25 刀\n#Irvine美食 #粤菜 #生日聚餐",
    assistant: {
      name: "Capital Seafood",
      address: "Diamond Jamboree",
      cuisine: ["中餐", "粤菜", "海鲜"],
      price_range: "$$",
      occasions: ["生日聚餐"],
      tags: ["茶点"],
      recommended_by: "XHS博主",
      reason: "好好吃",
      confidence: "high",
    },
  },
  {
    user: "上次和女朋友去的那家寿司，太赞了",
    assistant: {
      name: "（未知）",
      address: "（未知）",
      cuisine: ["日料", "寿司"],
      status: "visited",
      reason: "太赞了",
      confidence: "low",
      notes: "原文没提到餐厅名和地址，需要你补充。",
    },
  },
];

export type ExtractResult =
  | { ok: true; data: ExtractedPlace }
  | { ok: false; error: string };

export async function extractPlaceFromText(
  text: string,
): Promise<ExtractResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "请输入要识别的内容" };
  if (trimmed.length > 5000)
    return { ok: false, error: "文本过长，超过 5000 字" };

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
      max_tokens: 1024,
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
        format: zodOutputFormat(ExtractedPlaceSchema),
      },
    });

    if (!response.parsed_output) {
      return { ok: false, error: "AI 未返回有效结构化结果，请重试或换种描述" };
    }

    return { ok: true, data: response.parsed_output };
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
