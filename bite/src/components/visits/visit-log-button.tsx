"use client";

import { useState } from "react";
import { VisitLogForm, type VisitPrefill } from "./visit-log-form";
import { CheckIcon } from "@/components/ui/icons";

export function VisitLogButton({
  placeId,
  variant = "chip",
  prefill,
}: {
  placeId: string;
  /** chip = 卡片用紧凑样式；btn = 详情页用正常按钮 */
  variant?: "chip" | "btn";
  /** 重访预填：上次（自己的）造访的 sentiment/星级/同伴，只改有变化的 */
  prefill?: VisitPrefill;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          variant === "chip"
            ? "chip chip-neutral cursor-pointer hover:opacity-80"
            : "btn-secondary px-3 py-1.5 text-sm"
        }
        title="记一次造访"
      >
        <CheckIcon size={12} />
        我去了
      </button>
      <VisitLogForm
        mode={{ kind: "create", placeId, prefill }}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
