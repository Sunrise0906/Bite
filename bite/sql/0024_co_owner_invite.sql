-- 0024：co_owner 也能发邀请链接
--
-- 背景：清单超过 2 个人之后，「谁能拉人」就成了真问题。原来的
-- invites_insert_owner_only 要求执行者必须是 lists.owner_id，于是 co_owner
-- 想把第三个人拉进来是死路 —— 必须回头找 owner 本人手动生成链接。
--
-- 和 0019（co_owner 可以改清单名）同一个方向：co_owner 是「共同拥有者」，
-- 不是只读来宾。owner 独占的仍然是那几件不可逆的事：删清单、撤销邀请、
-- 改/移除成员、转让 owner（0019 的触发器锁死了 owner_id）。
--
-- ⚠️ 需要在 Supabase SQL Editor 里手工执行（本仓库没有 migration ledger，
-- 权威清单见 bite/README.md → 数据库初始化）。

drop policy if exists "invites_insert_owner_only" on public.list_invites;

create policy "invites_insert_writer"
  on public.list_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.can_write_list(list_id)
  );

comment on policy "invites_insert_writer" on public.list_invites is
  'owner 和 co_owner 都能发邀请（0024）。撤销邀请仍限 owner。';
