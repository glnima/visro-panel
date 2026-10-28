"use client";

import { AlertTriangle, Check, CircleDot, Clock } from "lucide-react";
import { localDate } from "@/lib/dates";
import { faDate } from "@/lib/format";
import { openDelay, stageState, type StageState } from "@/lib/production";
import { DELAY_REASONS, type OrderItem, type StageKey } from "@/lib/types";

export const STATE_STYLE: Record<StageState, { cls: string; label: string; Icon: typeof Check }> = {
  done: { cls: "bg-[#DCFCE7] border-[#86EFAC] text-[#166534]", label: "تمام شد", Icon: Check },
  active: { cls: "bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]", label: "آماده‌ی کار", Icon: CircleDot },
  waiting: { cls: "bg-[#F5F1E8] border-[#E4DCC8] text-[#8A7B60]", label: "منتظر قبلی", Icon: Clock },
  delayed: { cls: "bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]", label: "تأخیر", Icon: AlertTriangle },
};

type Props = {
  item: OrderItem;
  stage: StageKey;
  stageLabel: string;
  mine: boolean; // the viewer's own station: highlighted when there's work
  onOpen: () => void;
  compact?: boolean; // phone layout: show the station name inside the chip
};

export default function StageCell({ item, stage, stageLabel, mine, onOpen, compact }: Props) {
  const state = stageState(item, stage);
  const { cls, label, Icon } = STATE_STYLE[state];
  const done = item.done[stage];
  const delay = openDelay(item, stage);
  const detail = state === "done" && done ? faDate(localDate(done.at)) : delay ? DELAY_REASONS[delay.reason] : "";

  const ring = mine && (state === "active" || state === "delayed") ? " ring-2 ring-[#9C7A3C]/50" : "";
  const title = `${stageLabel}: ${label}${detail ? " — " + detail : ""}${done?.by ? " — " + done.by : ""}`;

  if (compact) {
    // phone: state icon (its shape carries the state, not just colour) + station name
    return (
      <button
        type="button"
        onClick={onOpen}
        title={title}
        aria-label={title}
        className={"flex w-full min-w-0 flex-col items-center gap-0.5 rounded-lg border px-0.5 py-1.5 " + cls + ring}
      >
        <Icon size={15} className="shrink-0" />
        <span className="w-full truncate text-center text-[10px] font-semibold leading-tight">{stageLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className={
        "group w-full min-w-0 rounded-lg border px-2 py-1.5 text-right transition-shadow hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#9C7A3C]/40 " +
        cls +
        ring
      }
    >
      <span className="flex items-center gap-1 text-xs font-semibold">
        <Icon size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {detail && <span className="block truncate text-[10px] opacity-80 mt-0.5">{detail}</span>}
    </button>
  );
}
