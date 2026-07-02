// V2 主题常量 —— client-safe（不 import next/headers）。
// 服务端读 cookie 的 getTheme 在 lib/ui-version.ts；这里只放类型/元数据，
// 客户端组件（ThemePicker）可以安全导入。

export type BiteTheme = "terracotta" | "midnight" | "pop" | "gallery";

export const THEME_COOKIE = "bite_theme";

export const THEMES: Array<{
  id: BiteTheme;
  label: string;
  sub: string;
  /** 选择器里的三个色卡 */
  dots: [string, string, string];
}> = [
  {
    id: "terracotta",
    label: "陶土",
    sub: "暖陶土 · serif 标题 · 默认",
    dots: ["#c75b3a", "#faf6f0", "#5f7155"],
  },
  {
    id: "midnight",
    label: "深夜食堂",
    sub: "常暗 · 金色 · 奢华衬线",
    dots: ["#d4a04f", "#131110", "#f4ede2"],
  },
  {
    id: "pop",
    label: "鲜果软糖",
    sub: "撞色 · 粗描边 · 硬阴影",
    dots: ["#f04e23", "#fffdf5", "#3f9142"],
  },
  {
    id: "gallery",
    label: "净白画廊",
    sub: "极简 · 抹茶 · 大留白",
    dots: ["#4d7c5f", "#f6f6f4", "#1c1c1e"],
  },
];

export function isBiteTheme(v: unknown): v is BiteTheme {
  return (
    v === "terracotta" || v === "midnight" || v === "pop" || v === "gallery"
  );
}
