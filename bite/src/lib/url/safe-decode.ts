// decodeURIComponent 对非法 %xx 序列会抛 URIError，
// 把它当 server-rendered 错误显示用就会让整个页面崩到 error 边界。
// 这里 try/catch 包一下：合法照常解码，非法直接返回原文。

export function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
