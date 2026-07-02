import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 拍照上传 / 拍照识店走 server action 传文件，photos bucket 上限 10MB；
      // Next 默认 1MB 会把真手机照片直接拒掉（e2e 的 1px 测试图掩盖了这一点）
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
