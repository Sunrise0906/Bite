"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { renameList, deleteList } from "@/lib/actions/lists";
import { leaveList } from "@/lib/actions/list-members";
import type { ListVM } from "./home-v2";

// 主页「我的清单」区块。
//
// 「管理」以前是个纯装饰的 <span>（从 V2 主页诞生起就没接过任何东西），主页因此
// 完全没有管理清单的入口——改名/删除/离开只在清单详情页里。这里把它做成真的。
//
// 业务逻辑一律复用既有 server action（renameList / deleteList / leaveList），
// 不另写一份；这里只负责适配行内的紧凑布局——lists/rename-list-form.tsx 那套
// 是给详情页大标题用的（text-3xl），塞不进列表行。

export function MyListsSection({ lists }: { lists: ListVM[] }) {
  const [manage, setManage] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <>
      <div className="v2-sec">
        <h3>我的清单</h3>
        {lists.length > 0 && (
          <button
            type="button"
            className="more"
            aria-pressed={manage}
            onClick={() => {
              setManage((v) => !v);
              setRenamingId(null);
            }}
          >
            {manage ? "完成" : "管理"}
          </button>
        )}
      </div>

      {lists.length === 0 ? (
        <div className="v2-empty" style={{ paddingBottom: 24 }}>
          <div className="t">还没有清单</div>
          <div className="s">在下面输入个名字，比如「Irvine 想吃的」</div>
        </div>
      ) : (
        <div className="v2-lgrid">
          {lists.map((l) =>
            manage ? (
              <ManageRow
                key={l.id}
                list={l}
                renaming={renamingId === l.id}
                onRename={() => setRenamingId(l.id)}
                onCancelRename={() => setRenamingId(null)}
              />
            ) : (
              <Link key={l.id} href={`/lists/${l.id}`} className="v2-lrow">
                <Thumbs list={l} />
                <Meta list={l} />
                <div className="cnt">{l.count}</div>
              </Link>
            ),
          )}
        </div>
      )}
    </>
  );
}

function Thumbs({ list: l }: { list: ListVM }) {
  return (
    <div className="v2-lthumbs">
      {l.thumbs.length > 0 ? (
        l.thumbs.slice(0, 3).map((t, i) => (
          <i key={i} style={{ backgroundImage: `url('${t}')` }} />
        ))
      ) : (
        <i />
      )}
    </div>
  );
}

function Meta({ list: l }: { list: ListVM }) {
  return (
    <div className="li">
      <div className="nm">
        {l.name}
        {l.isShared && (
          <span className="v2-pill v2-pill-visited" style={{ padding: "2px 8px" }}>
            共享
          </span>
        )}
      </div>
      <div className="mt">
        {l.isShared && l.faces.length > 0 && (
          <span className="v2-faces">
            {l.faces.slice(0, 3).map((f, i) => (
              <span key={i} className={`v2-ava${f.sage ? " sage" : ""}`}>
                {f.initial}
              </span>
            ))}
          </span>
        )}
        {l.isShared && <span className="v2-actdot" />}
        {l.activityLabel}
      </div>
    </div>
  );
}

function ManageRow({
  list: l,
  renaming,
  onRename,
  onCancelRename,
}: {
  list: ListVM;
  renaming: boolean;
  onRename: () => void;
  onCancelRename: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submitRename(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await renameList({ error: null }, formData);
      if (r.error) setError(r.error);
      else {
        onCancelRename();
        router.refresh();
      }
    });
  }

  function remove() {
    // owner 删清单会连带删掉里面所有店和造访记录，措辞与详情页保持一致
    if (
      !window.confirm(
        `确认删除清单「${l.name}」？这会同时删除其中所有的店铺记录与造访日志，且无法撤销。`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", l.id);
      // deleteList 成功时自己 redirect；失败时会带 ?error= 回来
      await deleteList(fd);
      router.refresh();
    });
  }

  function leave() {
    if (!window.confirm(`离开「${l.name}」？你将无法再访问。`)) return;
    setError(null);
    startTransition(async () => {
      const r = await leaveList(l.id);
      if ("error" in r) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className={`v2-lrow v2-lrow-manage${pending ? " is-pending" : ""}`}>
      <Thumbs list={l} />

      {renaming ? (
        <form action={submitRename} className="li v2-lrename">
          <input type="hidden" name="id" value={l.id} />
          <input
            type="text"
            name="name"
            defaultValue={l.name}
            autoFocus
            required
            maxLength={80}
            className="field-input"
            aria-label="清单名称"
          />
          <button type="submit" className="v2-btn" disabled={pending}>
            {pending ? "…" : "保存"}
          </button>
          <button
            type="button"
            className="v2-btn ghost"
            onClick={() => {
              setError(null);
              onCancelRename();
            }}
          >
            取消
          </button>
        </form>
      ) : (
        <>
          <Meta list={l} />
          <div className="v2-lacts">
            {l.isOwner && (
              <button type="button" onClick={onRename} disabled={pending}>
                重命名
              </button>
            )}
            {l.isOwner ? (
              <button
                type="button"
                className="danger"
                onClick={remove}
                disabled={pending}
              >
                删除
              </button>
            ) : (
              <button
                type="button"
                className="danger"
                onClick={leave}
                disabled={pending}
              >
                离开
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="v2-lerr">
          {error}
        </p>
      )}
    </div>
  );
}
