// 给 ?next= 参数做白名单。只允许同站点相对路径，防 open redirect。
//
// 注意必须拦住反斜杠：浏览器 URL parser 在 http(s) 协议下会把 `\` 当 `/`
// 处理，所以 "/\evil.com" 在 new URL(value, currentOrigin) 后会变成
// "https://evil.com/"。next/navigation 的 redirect() 把字符串原样发给客户端，
// 客户端再 parse 时就跳出去了。

export function safeNext(raw: string | FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/")) return "/lists";
  if (value.startsWith("//")) return "/lists"; // protocol-relative
  if (value.includes("\\")) return "/lists"; // 反斜杠会被 URL parser 当 /
  return value;
}
