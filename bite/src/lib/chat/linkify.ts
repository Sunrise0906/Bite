// 把 AI 回复里 «店名» 切分成 text/link/raw 三种段。
// LinkifiedText 拿到 parts 后纯渲染，不再有解析逻辑——便于 vitest。

export type LinkifiedSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; name: string; href: string }
  | { kind: "raw"; text: string };

const PLACE_NAME_RE = /«([^«»]{1,60})»/g;

export function parseLinkifiedSegments(
  text: string,
  placeMap: Record<string, { id: string; list_id: string }>,
): LinkifiedSegment[] {
  // 没有书名号直接全是 text，省一次正则跑
  if (!text.includes("«")) {
    return [{ kind: "text", text }];
  }

  const parts: LinkifiedSegment[] = [];
  // re 是 module-level 的；带 g flag 必须每次新建或重置 lastIndex
  const re = new RegExp(PLACE_NAME_RE.source, PLACE_NAME_RE.flags);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ kind: "text", text: text.slice(last, m.index) });
    }
    const name = m[1];
    const hit = placeMap[name];
    if (hit) {
      parts.push({
        kind: "link",
        name,
        href: `/lists/${hit.list_id}/places/${hit.id}/edit`,
      });
    } else {
      parts.push({ kind: "raw", text: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", text: text.slice(last) });
  }
  return parts;
}
