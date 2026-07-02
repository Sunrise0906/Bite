"use client";

import { useActionState, useRef } from "react";
import { createList } from "@/lib/actions/lists";

/** V2 主页的新建清单行（V1 CreateListForm 的 V2 皮，同一个 server action） */
export function CreateListV2() {
  const [state, action, pending] = useActionState(createList, { error: null });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="v2-newlist"
    >
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
      {state.error && (
        <p role="alert" className="err">
          {state.error}
        </p>
      )}
    </form>
  );
}
