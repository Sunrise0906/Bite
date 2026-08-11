// 「活跃」的判定。纯函数，供服务端渲染和单测使用。

/** 心跳间隔 30 秒，所以 5 分钟内没打卡基本可以确定人已经离开了 */
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/**
 * @param lastSeenAt ISO 时间串（没有 = 从没打过卡，比如 0026 之前的老用户）
 * @param now 便于测试注入
 */
export function isActive(
  lastSeenAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return false;
  // 未来时间（客户端时钟偏了 / 服务端时区问题）也算活跃，总比显示「离线」强
  return now - t <= ACTIVE_WINDOW_MS;
}
