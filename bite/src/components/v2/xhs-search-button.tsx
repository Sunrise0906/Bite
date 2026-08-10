"use client";

import { useState } from "react";
import { toast } from "sonner";

// 「在小红书搜这家」。
//
// ⚠️ 为什么不是一个普通链接：**没有任何可用的网页搜索路径**。
//   · xiaohongshu.com/search_result?keyword=X → 「你访问的页面不见了」
//   · xiaohongshu.com/web/search/result?…     → 302 到首页登录墙，关键词被丢掉
//   · Google 的 site:xiaohongshu.com          → 结构性为空。小红书 robots.txt 写着
//       User-agent: Googlebot / Disallow: /   （只放行一个世界杯专题）
//       其他爬虫至少放行 /explore/，唯独 Googlebot 连这个都不给；
//       User-agent: * 更是 Disallow: /。所以搜索引擎里根本没有可搜的内容。
//     —— 这也意味着走 Serper 的 searchXhsPosts()（同样是 site:xiaohongshu.com
//        的 Google 查询）基本永远返回空，见 lib/places/xhs-search.ts 的注释。
//
// 唯一真能搜到东西的地方是小红书 App 本身。所以这里：
//   1. 先把店名复制到剪贴板（**这一步一定成功**，是保底）
//   2. 再尝试 xhsdiscover:// 深链唤起 App 的搜索页
//   3. toast 告诉用户「已复制，没自动跳的话手动打开粘贴」
// 这样在装了 App 的手机上是一步到位，在桌面/没装 App 时也不会变成一个死按钮。

export function XhsSearchButton({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    let copied = false;
    try {
      await navigator.clipboard.writeText(name);
      copied = true;
    } catch {
      // 剪贴板可能被权限/非安全上下文挡掉，不影响后面的唤起
    }

    toast.success(
      copied ? `已复制「${name}」` : "去小红书搜这家",
      {
        description: copied
          ? "正在打开小红书 App…没有自动跳转的话，手动打开粘贴搜索即可"
          : "手动打开小红书 App，搜索这家店名",
        duration: 5000,
      },
    );

    // 深链唤起 App 的搜索结果页。没装 App / 桌面浏览器不会有任何反应 ——
    // 所以上面的复制才是保底，用户至少不用自己再打一遍店名。
    window.location.href = `xhsdiscover://search/result?keyword=${encodeURIComponent(name)}`;
    setTimeout(() => setBusy(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="v2-btn ghost"
      style={{ width: "100%", padding: 12, marginBottom: 16 }}
    >
      <svg className="v2-svg" width="16" height="16" viewBox="0 0 24 24">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M8 9h4.5M8 12.5h8M8 16h6" />
      </svg>
      {busy ? "正在打开小红书…" : "复制店名，去小红书搜"}
    </button>
  );
}
