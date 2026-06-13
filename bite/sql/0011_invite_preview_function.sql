-- ============================================================================
-- Bite · Migration 0011 — 邀请预览 security-definer 函数
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件全部内容 → Run
--
-- 背景（bug，0010 修了 accept 后才暴露）：
--   受邀者打开 /invite/<token> 时，loadInvitePreview 需要读 lists 表拿 list 名。
--   但受邀者此时还不是成员，被 lists 的 RLS（can_read_list 要求 owner/member）挡死，
--   于是 preview 返回 null，页面显示「这个邀请链接无效或已被撤销」。
--   ——先有鸡先有蛋：要看邀请详情才能接受，但看详情又要求先是成员。
--
-- 修法：security-definer 函数，只凭 token 返回该邀请 + list 名 + owner。
--   token 是 uuid v4（122 bit）不可枚举，安全模型同 list_invites 的 any-auth select：
--   「持有 token = 有权看这条邀请」。函数绕过 RLS 但只返回精确 token 对应的一行。
-- ============================================================================

create or replace function public.get_invite_preview(p_token uuid)
returns table (
  token uuid,
  list_id uuid,
  list_name text,
  role text,
  expires_at timestamptz,
  used_at timestamptz,
  owner_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.token,
    i.list_id,
    l.name as list_name,
    i.role,
    i.expires_at,
    i.used_at,
    l.owner_id
  from public.list_invites i
  join public.lists l on l.id = i.list_id
  where i.token = p_token;
$$;

-- 仅登录用户可调用（匿名访客无意义；未登录会被 proxy 拐去 /login）
revoke all on function public.get_invite_preview(uuid) from public;
grant execute on function public.get_invite_preview(uuid) to authenticated;
