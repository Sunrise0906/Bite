"use client";

import { useActionState, useRef, useState } from "react";
import { createList } from "@/lib/actions/lists";
import { CATEGORIES, type ListCategory } from "@/lib/categories";

/** V2 主页的新建清单行（V1 CreateListForm 的 V2 皮，同一个 server action）。
 *  可选清单领域（吃/喝/玩/其他）——多领域清单的入口（sql/0016）。 */
export function CreateListV2() {
  const [state, action, pending] = useActionState(createList, { error: null });
  const formRef = useRef<HTMLFormElement>(null);
  const [cat, setCat] = useState<ListCategory>("food");

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
        setCat("food");
      }}
      className="v2-newlist"
    >
      <input type="hidden" name="category" value={cat} />
      <div className="row">
        <input
          type="text"
          name="name"
          placeholder="新建 list，例如 “Irvine 想吃的”"
          required
          maxLength={80}
        />
        <button type="submit" disabled={pending} className="v2-btn">
          {pending ? "创建中…" : "新建"}
        </button>
      </div>
      <div className="cats">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`v2-fchip${cat === c.id ? " on" : ""}`}
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="err">
          {state.error}
        </p>
      )}
    </form>
  );
}
