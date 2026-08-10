-- ============================================================================
-- Bite · Migration 0019 — 允许 co_owner 重命名共享清单
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件全部内容 → Run
-- 顺序：纯增量，先跑 SQL 再部署代码都行（旧代码不会用到放开的权限）。
--
-- ---------------------------------------------------------------------------
-- 背景
--
-- 设计文档说 co-owner 是「多个用户共同维护一个 list，**平等读写权限**」，
-- 而 sql/0001 的实现比这严一档：
--   · places / visit_logs 等走 can_write_list()（owner 或 co_owner）✓
--   · 但 lists 表自己是 `lists_update_owner`（owner-only）
-- 结果：co-owner 能加店、改店、删店、记造访，唯独改不了清单的名字。
-- 情侣/室友共用一个清单时这个限制没道理 —— 大概率是当初写 RLS 时顺手把
-- lists 的 update/delete 一起收成 owner-only，没单独考虑 rename。
--
-- 本迁移只放开**改名**。删除清单**仍然只有 owner**（lists_delete_owner 不动）：
-- 删清单会连带删掉所有店和造访记录，不可逆，不该让 co-owner 干。
--
-- ---------------------------------------------------------------------------
-- 为什么还需要一个触发器
--
-- RLS 是**行级**的，不是列级的 —— 放开 lists 的 UPDATE 就等于放开了整行，
-- co-owner 可以顺手改 owner_id（把清单过户到自己名下）或 category。
-- WITH CHECK 只看得到 NEW 行，看不到 OLD，没法表达「这一列不许变」。
-- 所以用一个 BEFORE UPDATE 触发器补上列级约束。
-- ============================================================================

-- ---- 1. UPDATE 放开到 can_write_list（owner 或 co_owner）--------------------
drop policy if exists "lists_update_owner" on public.lists;

create policy "lists_update_writer"
  on public.lists for update
  to authenticated
  using (public.can_write_list(id))
  with check (public.can_write_list(id));

-- ---- 2. 列级约束：owner_id 永不可改；co_owner 只能改 name ------------------
create or replace function public.lists_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 所有权不可转让（产品上就没有转让入口；owner 唯一，见设计文档）
  if new.owner_id is distinct from old.owner_id then
    raise exception '不能转让清单所有权';
  end if;

  -- 非 owner（即 co_owner）只能改名字，不能改领域 / 建档时间
  if old.owner_id is distinct from auth.uid() then
    if new.category is distinct from old.category then
      raise exception '只有清单所有者能修改清单领域';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception '不能修改创建时间';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lists_guard_update on public.lists;
create trigger lists_guard_update
  before update on public.lists
  for each row execute function public.lists_guard_update();

-- ---- 3. 自检 ---------------------------------------------------------------
-- 跑完确认：
--   select policyname from pg_policies where tablename = 'lists' order by policyname;
--     期望有 lists_update_writer，且**没有** lists_update_owner；
--     lists_delete_owner 应仍在（删除依旧只有 owner）。
--   select tgname from pg_trigger where tgrelid = 'public.lists'::regclass and not tgisinternal;
--     期望包含 lists_guard_update 与已有的 lists_set_updated_at。
