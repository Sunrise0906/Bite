// 流式聊天的重试 + 跨 provider 故障转移。
//
// 抽取路径（extract-place.ts）早就有这套，但**聊天没有** —— /api/chat 直接
// getProvider() 然后 streamChat，撞上 Gemini 免费层的 429 就把
// 「限流，请稍后再试」原样甩给用户。用户最初报的就是这个，只是当时发生在加店路径上。
//
// ⚠️ 流式比一次性调用难在：一旦已经往客户端吐过字，就不能再换 provider 重来 ——
// 那会让用户看到半句话接另一句话。所以这里的规则是：
//   **只在「本次尝试还一个 chunk 都没产出」时才重试 / 换家。**
// 幸运的是我们真正关心的失败（429、鉴权、连不上）都发生在第一个 chunk 之前。
// 已经吐字之后再断，就如实报错，不假装无事发生。

import { buildProvider } from "./router";
import { LlmProviderError, type LlmError, type ResolvedProviderConfig } from "./types";
import type { LlmProvider, StreamChunk } from "./types";
import {
  backoffMs,
  exhaustedMessage,
  isTransient,
  shouldRetrySameProvider,
} from "./failover";

const MAX_RETRY_PER_PROVIDER = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 按 provider 链逐个尝试流式对话，产出 chunk。
 *
 * @param chain resolveProviderChain() 的结果（用户自带 key 时只有一个元素）
 * @param run   给定 provider 返回一个 chunk 异步迭代器
 */
export async function* streamWithFailover(
  chain: ResolvedProviderConfig[],
  run: (provider: LlmProvider) => AsyncIterable<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  let lastKind: LlmError["type"] = "unknown";

  for (const config of chain) {
    const provider = buildProvider(config);

    for (let attempt = 0; attempt <= MAX_RETRY_PER_PROVIDER; attempt++) {
      let emitted = false;
      try {
        for await (const chunk of run(provider)) {
          emitted = true;
          yield chunk;
        }
        return; // 正常跑完
      } catch (err) {
        const kind: LlmError["type"] =
          err instanceof LlmProviderError ? err.kind : "unknown";
        lastKind = kind;

        // 已经吐过字：不能重来（用户会看到半句接半句），如实抛出
        if (emitted) throw err;
        // 配置类错误：换几家都是同一个错，立刻暴露
        if (!isTransient(kind)) throw err;

        if (attempt < MAX_RETRY_PER_PROVIDER && shouldRetrySameProvider(kind)) {
          await sleep(backoffMs(attempt));
          continue;
        }
        break; // 换下一个 provider
      }
    }
  }

  throw new LlmProviderError(lastKind, exhaustedMessage(lastKind, chain.length));
}
