// apple-app-site-association —— 让 https://<域名>/invite/<token> 这类链接直接在 iOS App 里打开。
//
// 通过 next.config.ts 的 rewrite 挂在 /.well-known/apple-app-site-association 上。
// Apple 要求 Content-Type 是 application/json 且不带扩展名，静态 public/ 目录做不到，
// 所以用 route handler 生成。没配 APPLE_TEAM_ID 时返回 404，网页完全不受影响。
//
// 配置见 ios/README.md「Universal Links」一节。

export const dynamic = "force-dynamic";

export function GET() {
  const team = process.env.APPLE_TEAM_ID?.trim();
  const bundle = process.env.IOS_BUNDLE_ID?.trim() || "com.sunrise.bite";
  if (!team) return new Response("Not configured", { status: 404 });

  const appID = `${team}.${bundle}`;
  const body = {
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: [
            { "/": "/invite/*", comment: "清单邀请链接" },
            { "/": "/lists/*", comment: "清单 / 店铺详情" },
            { "/": "/recommendations", comment: "推荐收件箱" },
            { "/": "/chat", comment: "聊天" },
          ],
        },
      ],
    },
    webcredentials: { apps: [appID] },
  };
  return Response.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
