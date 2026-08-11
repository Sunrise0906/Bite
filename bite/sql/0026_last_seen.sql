-- 0026：profiles.last_seen_at —— 廉价版「谁在线」
--
-- 没上 Supabase Realtime Presence：那需要先建一个浏览器端 supabase client
-- （项目目前一个都没有，全部走 server action），还要配 realtime.messages 的 RLS，
-- 否则知道 list id 就能订阅任意清单的频道。先用一个 30 秒节流的心跳看看
-- 「朋友之间到底会不会在意谁在线」，真有人用再考虑上 Realtime。
--
-- ⚠️ 需要在 Supabase SQL Editor 里手工执行（本仓库没有 migration ledger，
-- 权威清单见 bite/README.md → 数据库初始化）。

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- profiles 的 update 策略本来就是「只能改自己那行」，心跳照此写入即可，
-- 不需要新策略。

comment on column public.profiles.last_seen_at is
  '最后一次活跃时间。由客户端心跳节流写入（0026），用于「N 分钟内活跃」。';
