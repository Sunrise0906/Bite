-- ============================================================================
-- Bite · Migration 0013 — photos bucket 转私有（隐私加固）
--
-- ⚠️ 顺序很重要：先部署带 signed URL 的代码（lib/storage/signed-photos），
--    再跑本文件。老代码直接渲染 public URL，先跑这个会让线上图片全部打不开。
--    （新代码在 bucket 还是 public 时也能正常工作——签名失败回退原 URL——
--    所以「先代码后 SQL」是安全的，反过来不是。）
--
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run（幂等，可重复跑）
--
-- 做了什么：
--   1. photos bucket public → false：没有签名的 URL（含历史泄露的链接）一律 400。
--      DB 里存的 canonical URL（.../object/public/photos/...）继续作稳定标识，
--      展示层由 server 在渲染时换成 7 天有效的 signed URL。
--   2. SELECT 策略收紧：anon 移除，仅 authenticated（登录用户能给任何 photos
--      对象创建 signed URL——共享 list 上要能看到朋友传的图，且真正的威胁模型
--      是"拿到链接的陌生人"而非其他登录用户）。
--   3. INSERT / UPDATE / DELETE 策略不变（0009：只能动自己 <uid>/ 目录）。
-- ============================================================================

update storage.buckets set public = false where id = 'photos';

drop policy if exists "photos_select_public_read" on storage.objects;
drop policy if exists "photos_select_authenticated_read" on storage.objects;
create policy "photos_select_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photos');
