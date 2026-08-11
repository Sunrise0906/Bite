// 「一起选」的判定规则。纯函数：客户端组件、页面文案和 server action 都要用，
// 而 actions/pick.ts 是 server-action 文件（顶部指令那种，只能导出 async 函数），放不下它。

/**
 * 达成一致需要多少人右滑同一家 —— **简单多数**。
 *
 * 以前是写死的「≥2 个不同用户」，与清单实际人数无关：3~5 人的清单里，
 * 最先凑够两个人的那家直接替全组拍板、session 立刻结束，剩下的人票作废
 * 且收不到结果通知。多数决在 2 人时与旧行为完全一致（2/2），人多了才收紧。
 *
 * 下限是 2：单人清单里自己右滑一家不该立刻「就它了」——
 * 那一屏本来就是「右滑收藏，滑完随机挑一家」。
 */
export function votesNeeded(memberCount: number): number {
  return Math.max(2, Math.floor(memberCount / 2) + 1);
}
