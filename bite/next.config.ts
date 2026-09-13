import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 拍照上传 / 拍照识店走 server action 传文件，photos bucket 上限 10MB；
      // Next 默认 1MB 会把真手机照片直接拒掉（e2e 的 1px 测试图掩盖了这一点）
      bodySizeLimit: "12mb",
    },
  },
  async rewrites() {
    return [
      {
        // iOS universal links（邀请链接直接在 App 里打开）。内容由 env 决定，
        // 见 src/app/api/mobile/aasa/route.ts；没配 APPLE_TEAM_ID 就 404，网页不受影响。
        source: "/.well-known/apple-app-site-association",
        destination: "/api/mobile/aasa",
      },
    ];
  },
};

export default nextConfig;
