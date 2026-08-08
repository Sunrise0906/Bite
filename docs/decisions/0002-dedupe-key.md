# ADR 0002 — 店铺去重键

- **状态**：未决 ⚠️
- **提出**：2026-08-07
- **决定人**：项目所有者

## 现状

同一个清单里判断「这家店已经加过了」用的是 **`(list_id, name)` 精确字符串相等**：

```ts
// bite/src/lib/actions/quick-add.ts —— 写入循环之前一次性构建
const existingByName = new Map(rows.map((r) => [r.name, r]));
```

`bite/sql/0001_initial.sql` 的 `places` 表**没有任何唯一索引**兜底。

## 四个问题

1. **无归一化** —— 大小写、首尾空白、后缀变体全是不同行：
   `Kura Sushi` / `kura sushi`、`海底捞` / `海底捞 Irvine`。
2. **批内不簿记** —— `existingByName` 在循环开始前构建一次，所以同一批（合集帖）里
   两个同名候选都会走 INSERT 分支，直接产出重复行。
3. **过度合并** —— 反过来，两家真正不同的分店如果名字一模一样（连锁店很常见）
   会被塌进同一行，理由、照片、菜品互相污染。
4. **「（未知）」垃圾行累积** —— `extract-place.ts` 的 few-shot 明确教模型对低置信条目
   输出 `name: "（未知）"`，而 `savePlacesBatch` 不做字段校验（`savePlaceFromDraft` 会拒
   空名/空地址/零菜系，批量路径不会）。于是每篇合集帖产出的「（未知）」都会合并进
   同一行垃圾记录，不断累积无关的菜品、照片和理由。

整个合并设计假定 `name` 是可靠键，而它不是。

## 候选方案

**有 `google_place_id` 时用它，否则回退到归一化后的 name**，再配一个部分唯一索引：

```sql
-- 有 place_id 的：按 (list_id, google_place_id) 唯一
create unique index places_list_gplace_uniq
  on public.places (list_id, google_place_id)
  where google_place_id is not null;

-- 没有的：按 (list_id, 归一化 name) 唯一
create unique index places_list_normname_uniq
  on public.places (list_id, lower(btrim(name)))
  where google_place_id is null;
```

同时：
- 写入改成 `upsert ... on conflict do update`，顺带解决批内竞态（问题 2）
- `savePlacesBatch` 补上 `savePlaceFromDraft` 已有的字段校验，直接拒掉「（未知）」

## 需要一起决定的：历史数据怎么办

加唯一索引前必须先清理已有的冲突行。至少三类：

- 历史上被**错误合并**的行（两家不同分店塌成一行）——无法自动拆开，只能人工看
- 历史上**重复**的行（同店多行）——可以自动合并，但要定「保留哪行、字段怎么并」
- 已累积的「（未知）」垃圾行——大概率直接删

这是一次性的数据迁移决策，只有你能拍板。

## 建议

先做**零风险的那一半**：`savePlacesBatch` 补字段校验（挡住新的垃圾行），
以及在构建 `existingByName` 后于循环内簿记新插入的 name（挡住批内重复）。
唯一索引 + 数据迁移等你想清楚历史数据怎么处理再做。
