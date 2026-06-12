-- ============================================================================
-- Bite · Migration 0010 — 修复 list_members 的两个 RLS policy 缺口
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件全部内容 → Run
--
-- 背景（bug）：
--   1. acceptListInvite 是【受邀者】身份往 list_members 插自己，但 0001 里唯一的
--      insert policy（list_members_insert_owner）要求执行者是 list owner，
--      导致接受邀请必被 RLS 拒：「new row violates row-level security policy」。
--      整条邀请共享链路从未在 DB 层走通过。
--   2. list_members 没有任何 UPDATE policy → changeMemberRole 的 update 匹配
--      0 行且不报错，owner 改成员角色静默失效。
-- ============================================================================

-- ---- 1. 受邀者凭有效邀请把自己加进 list ------------------------------------
-- 条件：
--   - 只能插自己（user_id = auth.uid()）
--   - 该 list 存在未使用、未过期的邀请
--   - 插入的 role 必须与邀请的 role 一致（防止持 viewer 邀请自封 co_owner）
-- 注：list_invites 的 select policy 是 any-auth（0008），子查询可见。
--     「一次性使用」由应用层标 used_at 实现；两人同时用同一 token 的竞态
--     窗口可接受（token 本就是持有者凭据）。
create policy "list_members_insert_invitee"
  on public.list_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.list_invites i
      where i.list_id = list_members.list_id
        and i.used_at is null
        and i.expires_at > now()
        and i.role = list_members.role::text
    )
  );

-- ---- 2. owner 可改成员角色（co_owner ⇄ viewer）------------------------------
create policy "list_members_update_owner"
  on public.list_members for update
  to authenticated
  using (
    exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  );
