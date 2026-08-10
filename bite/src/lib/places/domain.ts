// 清单领域（吃 / 喝 / 玩 / 其他）对应的字段语义。
//
// 背景：数据库里一家「店」只有一套字段（cuisine / price_range / dishes），
// 是照着「吃」设计的。但清单已经分领域了（sql/0016 的 lists.category），
// 而看展、徒步、密室这类地方硬套「菜系 / 人均 / 招牌菜」是说不通的 ——
// 实测把一篇看展的小红书帖子丢进抽取，模型会正确地判断「这不是餐厅」
// 而返回空数组，最后报「AI 未返回有效结构化结果」，根本加不进去。
//
// 这里不改存储（列还是那几列），只把**语义**按领域重新解释：
//   cuisine     → 吃：菜系   / 喝：品类 / 玩：类型
//   price_range → 吃喝：人均 / 玩：门票或人均消费
//   dishes      → 吃喝：招牌菜/招牌饮品 / 玩：亮点
// 抽取 prompt 和表单标签共用这一份，避免两边漂移。

export type PlaceDomain = "food" | "drink" | "activity" | "other";

export function isPlaceDomain(v: unknown): v is PlaceDomain {
  return v === "food" || v === "drink" || v === "activity" || v === "other";
}

export type DomainVocab = {
  /** 这个领域里「一个去处」怎么称呼 */
  noun: string;
  /** cuisine 列在这个领域叫什么 */
  typeLabel: string;
  /** cuisine 的候选值，喂给 LLM 也显示给用户当提示 */
  typeExamples: string[];
  /** price_range 列在这个领域叫什么 */
  priceLabel: string;
  /** price_range 的口径说明 */
  priceHint: string;
  /** dishes 列在这个领域叫什么 */
  highlightLabel: string;
  /** dishes 的口径说明 */
  highlightHint: string;
};

export const DOMAIN_VOCAB: Record<PlaceDomain, DomainVocab> = {
  food: {
    noun: "餐厅",
    typeLabel: "菜系",
    typeExamples: [
      "中餐", "川菜", "粤菜", "火锅", "面食", "日料", "寿司", "拉面",
      "韩餐", "烧烤", "美式", "墨西哥菜", "越南菜", "泰餐", "台菜", "上海菜",
    ],
    priceLabel: "人均",
    priceHint: "人均消费",
    highlightLabel: "招牌菜",
    highlightHint: "原文点名推荐的【具体菜】（「麻酱小面」「烧鸭炒饭」）",
  },
  drink: {
    noun: "店",
    typeLabel: "品类",
    typeExamples: [
      "咖啡", "手冲", "奶茶", "果茶", "酒吧", "清吧", "精酿", "甜品",
      "烘焙", "冰淇淋", "果汁",
    ],
    priceLabel: "人均",
    priceHint: "人均消费",
    highlightLabel: "招牌",
    highlightHint: "原文点名推荐的【具体饮品/甜点】（「桂花拿铁」「巴斯克」）",
  },
  activity: {
    noun: "去处",
    typeLabel: "类型",
    typeExamples: [
      "展览", "美术馆", "博物馆", "徒步", "海滩", "公园", "密室", "剧本杀",
      "livehouse", "演出", "电影", "球场", "保龄球", "露营", "温泉", "市集",
    ],
    priceLabel: "花费",
    priceHint: "门票或人均消费（免费就省略）",
    highlightLabel: "亮点",
    highlightHint:
      "原文点名值得看/值得玩的【具体项目】（「无限镜屋」「三楼 Basquiat 展厅」「日落步道」）",
  },
  other: {
    noun: "去处",
    typeLabel: "类型",
    typeExamples: ["购物", "书店", "理发", "健身", "宠物", "生活服务"],
    priceLabel: "花费",
    priceHint: "人均消费（不明确就省略）",
    highlightLabel: "亮点",
    highlightHint: "原文点名推荐的【具体项目】",
  },
};

export function vocabFor(domain: PlaceDomain | null | undefined): DomainVocab {
  return DOMAIN_VOCAB[domain && isPlaceDomain(domain) ? domain : "food"];
}

/**
 * 给抽取 prompt 追加的领域聚焦段。
 *
 * 只有在**已经知道要加进哪个清单**时才用得上（从清单页发起）。从主页发起时
 * 目标清单还没定，走通用 prompt —— 所以通用 prompt 本身也必须能处理玩乐内容，
 * 不能假定一定是餐厅。
 */
export function domainFocusPrompt(domain: PlaceDomain): string {
  const v = DOMAIN_VOCAB[domain];
  const domainName =
    domain === "food" ? "吃" : domain === "drink" ? "喝" : domain === "activity" ? "玩乐" : "其他";
  return [
    ``,
    `【本次目标清单的领域：${domainName}】`,
    `- 用户要把它加进一个「${domainName}」清单，按这个领域理解内容。`,
    `- cuisine 这一栏在本领域是「${v.typeLabel}」，常见值：${v.typeExamples.slice(0, 10).join("、")}`,
    `- price_range 是「${v.priceHint}」`,
    `- dishes 是「${v.highlightLabel}」：${v.highlightHint}`,
    `- 如果内容明显不属于这个领域（比如往玩乐清单里粘了家餐厅），照实抽取即可，不要硬凑。`,
  ].join("\n");
}
