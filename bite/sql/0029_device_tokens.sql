-- 0029：iOS 设备的 APNs token（原生推送）
--
-- 网页端用 Web Push（push_subscriptions，sql/0015）。iOS App 没有 service worker，
-- 走 Apple 的 APNs：设备启动时向 Apple 要一个 device token，登记到这张表；
-- 发通知时服务端用 service role 读**接收者**的 token（RLS 只让本人读自己的，
-- 跨用户发送只能走 service role，口径同 push_subscriptions）。
-- 发送实现：bite/src/lib/push/apns.ts，由 sendPushToUsers 统一触发，
-- 所以推荐 / 邀请 / 新店 / 一起选匹配 / 留言 这五个触发点网页和 App 完全一致。
--
-- ⚠️ 需要在 Supabase SQL Editor 里手工执行（本仓库没有 migration ledger，
-- 权威清单见 bite/README.md → 数据库初始化）。纯增量，先跑后跑都行。

create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios')),
  -- Debug 构建连的是 APNs sandbox，TestFlight / App Store 连 production；
  -- 发错环境 Apple 直接回 400 BadDeviceToken，所以要记下来
  environment text not null default 'production'
    check (environment in ('sandbox', 'production')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

drop trigger if exists device_tokens_set_updated_at on public.device_tokens;
create trigger device_tokens_set_updated_at
  before update on public.device_tokens
  for each row execute function public.set_updated_at();

alter table public.device_tokens enable row level security;

-- 本人只能看 / 删自己的；写入一律走下面的函数
drop policy if exists "device_tokens_select_own" on public.device_tokens;
create policy "device_tokens_select_own"
  on public.device_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "device_tokens_delete_own" on public.device_tokens;
create policy "device_tokens_delete_own"
  on public.device_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- 登记：同一台设备换账号登录时 token 不变，但那行属于上一个用户，
-- 普通 upsert 会被 RLS 拦成 0 行（或报错）。SECURITY DEFINER 里先删旧归属再插入。
create or replace function public.register_device_token(
  p_token text,
  p_platform text default 'ios',
  p_environment text default 'production'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'invalid_token';
  end if;

  delete from public.device_tokens where token = p_token and user_id <> v_uid;

  insert into public.device_tokens (token, user_id, platform, environment)
  values (p_token, v_uid, coalesce(p_platform, 'ios'), coalesce(p_environment, 'production'))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        environment = excluded.environment,
        updated_at = now();
end;
$$;

revoke all on function public.register_device_token(text, text, text) from public, anon;
grant execute on function public.register_device_token(text, text, text) to authenticated;

comment on table public.device_tokens is
  'iOS APNs 设备 token，每台设备一行。发送端 lib/push/apns.ts；网页端对应表是 push_subscriptions。';

-- ---- 自检 ------------------------------------------------------------------
--   select public.register_device_token(repeat('ab', 32), 'ios', 'sandbox');
--   select * from public.device_tokens where user_id = auth.uid();
--   delete from public.device_tokens where user_id = auth.uid();
