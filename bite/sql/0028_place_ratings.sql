-- 0028：快捷评价（档位）—— 夯 / 顶级 / 人上人 / NPC / 拉完了
--
-- ⚠️ 依赖 0027：那一版给 places 加了 `unique (id, list_id)`，本文件的复合外键靠它。
--    没跑 0027 就跑这个会报 42830（没有匹配的唯一约束）。
--
-- ---------------------------------------------------------------------------
-- 为什么另起一张表，而不是复用已有的两套评分
--
-- 库里已经有两个评价维度，但**都绑定在一次造访上**：
--   - visit_logs.sentiment（会再来 / 还行 / 不会再来，必填）—— 这是**行为意向**，
--     AI 推荐重度依赖它（last_sentiment=will_return 是强信号）。
--   - visit_logs.star_rating（1-5 星，选填）。
--
-- 而这个功能的全部意义是**一键**：在清单列表里点一下就完事，不填表、不挑日期。
-- 挂到 visit_logs 上就得先造一条造访记录，于是每点一次评价，店详情的
-- 「去过 N 次」和 /stats 的足迹统计都会多算一次 —— 用假数据换了个入口，不划算。
--
-- 档位描述的也是另一回事：sentiment 是「我还来不来」，档位是「这店几斤几两」。
-- 一家店可以是「顶级」但「不会再来」（太贵 / 太远）。两个维度不互相替代。
--
-- ---------------------------------------------------------------------------
-- RLS 口径：**can_read_list 而不是 can_write_list**
--
-- 与 place_comments(0025) / pick_votes(0014) 一致 —— viewer 也该能表态。
-- 「不能改清单内容」和「不能开口」是两回事。
--
-- ⚠️ 需要在 Supabase SQL Editor 里手工执行（本仓库没有 migration ledger，
-- 权威清单见 bite/README.md → 数据库初始化）。
-- ============================================================================

create table if not exists public.place_ratings (
  place_id uuid not null,
  -- 冗余一份 list_id：RLS 才能直接调 can_read_list，不用每次 join places
  list_id  uuid not null,
  user_id  uuid not null references auth.users(id) on delete cascade,

  -- ⚠️⚠️ 极性：**1 = 最好**（夯），5 = 最差（拉完了）。
  -- 这跟同一个库里的 visit_logs.star_rating（**5 = 最好**）**方向相反**。
  -- 两个 1-5 的标度反着来，迟早有人写出 max() 当「最好」——所以应用层的比较
  -- 一律走 src/lib/places/tier.ts 的 helper，不要直接比数字。
  --
  -- 存序号而不是 enum：这五个词是网络梗，改名换词的概率远高于改语义，
  -- 不该为了换个说法跑一次 migration。star_rating 也是同样的 int + CHECK。
  tier smallint not null check (tier between 1 and 5),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 每人每店一条（共享清单里各评各的，口径同 places.reasons）。
  -- 同时给 upsert 的 on conflict 提供唯一约束。
  primary key (place_id, user_id),

  -- 0027 的教训：只校验 list_id、不校验「place 真的属于这个 list」，
  -- 等于留了一条跨清单注入。复合外键一次锁死两者的一致性，insert / update
  -- 都覆盖，且不依赖任何策略写得对不对。
  constraint place_ratings_place_list_fkey
    foreign key (place_id, list_id)
    references public.places(id, list_id)
    on delete cascade
);

comment on table public.place_ratings is
  '快捷评价（档位）：每人每店一条。tier 1=夯 最好 … 5=拉完了 最差 —— 注意与 '
  'visit_logs.star_rating（5 最好）方向相反。viewer 也能评（口径同 place_comments）。';

-- 清单页一次拉整个清单的评价
create index if not exists place_ratings_list_idx
  on public.place_ratings(list_id);

alter table public.place_ratings enable row level security;

-- 读：清单里的人都能读（要显示「@女朋友 觉得这家 NPC」）
drop policy if exists "place_ratings_select_readers" on public.place_ratings;
create policy "place_ratings_select_readers"
  on public.place_ratings for select
  to authenticated
  using (public.can_read_list(list_id));

-- 写：读得到就能评，但只能评成自己的那条
drop policy if exists "place_ratings_insert_readers" on public.place_ratings;
create policy "place_ratings_insert_readers"
  on public.place_ratings for insert
  to authenticated
  with check (public.can_read_list(list_id) and user_id = auth.uid());

-- 改：口径与 insert 一致 —— 「你现在仍然读得到这个清单」也要成立。
-- （0025 当初只写了 user_id = auth.uid()，0027 才补上这半条；这里一次写对。）
drop policy if exists "place_ratings_update_own" on public.place_ratings;
create policy "place_ratings_update_own"
  on public.place_ratings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_read_list(list_id));

drop policy if exists "place_ratings_delete_own" on public.place_ratings;
create policy "place_ratings_delete_own"
  on public.place_ratings for delete
  to authenticated
  using (user_id = auth.uid());

-- updated_at 自动维护（set_updated_at 在 0001 建好，0020 加固了 search_path）
drop trigger if exists place_ratings_set_updated_at on public.place_ratings;
create trigger place_ratings_set_updated_at
  before update on public.place_ratings
  for each row execute function public.set_updated_at();

-- ---- 自检 ------------------------------------------------------------------
--   -- 1) 能给自己清单里的店评价
--   insert into public.place_ratings (place_id, list_id, user_id, tier)
--   select p.id, p.list_id, auth.uid(), 1 from public.places p limit 1;
--
--   -- 2) 越界档位必须被拒（23514 check violation）
--   update public.place_ratings set tier = 6 where user_id = auth.uid();
--
--   -- 3) list_id 与 place 不匹配必须被拒（23503 foreign key violation）
--   update public.place_ratings set list_id = gen_random_uuid() where user_id = auth.uid();
--
--   delete from public.place_ratings where user_id = auth.uid();  -- 清掉自检数据
