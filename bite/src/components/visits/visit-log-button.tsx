"use client";

import { useState } from "react";
import { VisitLogForm } from "./visit-log-form";

export function VisitLogButton({
  placeId,
  variant = "chip",
}: {
  placeId: string;
  /** chip = 卡片用紧凑样式；btn = 详情页用正常按钮 */
  variant?: "chip" | "btn";
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
        ✓ 我去了
      </button>
      <VisitLogForm
        mode={{ kind: "create", placeId }}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
