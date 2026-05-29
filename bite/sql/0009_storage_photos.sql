-- ============================================================================
-- Bite · Migration 0009 — Storage bucket `photos` + RLS（用户上传图片）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run（脚本幂等，可重复跑）
--
-- 做了什么：
--   1. 建/更新 storage.buckets 里名为 'photos' 的 bucket：
--        public=true（CDN 公开读）, 10MB 上限, 仅图片 MIME 白名单
--   2. 在 storage.objects 上加 4 条 RLS 策略，作用域 bucket_id = 'photos'：
--        - SELECT  对所有人开放（bucket 已 public，policy 是双保险）
--        - INSERT  仅登录用户，且必须写到自己的 <uid>/... 目录
--        - UPDATE  同上（owner 子文件夹）
--        - DELETE  同上
--   3. 作 visit_logs.photos 列的兜底（0001_initial.sql 已有该列；这里 add if not exists）
--
-- 路径约定：<auth.uid()>/<timestamp>-<sanitized-name>.<ext>
--   RLS 用 (storage.foldername(name))[1] = auth.uid()::text 校验第一段目录。
--
-- 注意：如果项目设置禁用了通过 SQL 建 bucket（少数项目），请：
--   a) 手动在 Dashboard → Storage → New bucket 建：name=photos, Public=ON,
--      file size limit=10MB, allowed MIME=image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif
--   b) 然后只跑下面"RLS 策略"那一段（第 2 段）
-- ============================================================================

-- ---- 1. Bucket：建/更新 ----------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  true,
  10485760,  -- 10 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---- 2. RLS 策略：storage.objects（作用域 bucket_id = 'photos'）------------
-- 用 drop-then-create 保证幂等（create policy 不支持 if not exists 的所有 PG 版本）

drop policy if exists "photos_select_public_read" on storage.objects;
create policy "photos_select_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'photos');

drop policy if exists "photos_insert_own_folder" on storage.objects;
create policy "photos_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_update_own_folder" on storage.objects;
create policy "photos_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_delete_own_folder" on storage.objects;
create policy "photos_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---- 3. visit_logs.photos 兜底（0001_initial.sql 已有，自包含安全网）------
alter table public.visit_logs
  add column if not exists photos text[] not null default '{}'::text[];
