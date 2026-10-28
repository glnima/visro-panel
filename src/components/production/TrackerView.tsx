"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, PanelLeftOpen, Truck } from "lucide-react";
import StageCell from "./StageCell";
import type { ProductionActions } from "./useProductionActions";
import { Empty, cardCls } from "../ui";
import { stationIcons } from "../stationIcons";
import { todayISO } from "@/lib/dates";
import { faDate, faNum } from "@/lib/format";
import { hasOpenDelay, isOrderReady, itemColors, itemProgress, statusOf, toneColor } from "@/lib/production";
import { STAGES, canDeliver, type Order, type OrderItem, type Role, type StageKey } from "@/lib/types";

const GRID = "md:grid md:grid-cols-[minmax(11rem,1.6fr)_repeat(5,minmax(5.5rem,1fr))_minmax(5.5rem,0.8fr)] md:gap-2 md:items-center";

type Props = {
  orders: Order[];
  role: Role;
  actions: ProductionActions;
  highlightId: number | null;
  onOpenStage: (order: Order, item: OrderItem, stage: StageKey) => void;
  onOpenOrder: (order: Order) => void;
};

export default function TrackerView({ orders, role, actions, highlightId, onOpenStage, onOpenOrder }: Props) {
  const today = todayISO();

  return (
    <div className={cardCls + " overflow-hidden"}>
      {/* column headers */}
      <div className={"hidden px-4 py-2.5 border-b border-[#E4DCC8] bg-[#EFE8D8] text-[11px] font-semibold text-[#6B5E4F] " + GRID}>
        <span>سفارش / قلم</span>
        {STAGES.map((s) => {
          const Icon = stationIcons[s];
          return (
            <span key={s} className="flex items-center gap-1">
              <Icon size={13} />
              {actions.label(s)}
            </span>
          );
        })}
        <span className="flex items-center gap-1">
          <Truck size={13} />
          {actions.label("final")}
        </span>
      </div>

      {orders.length === 0 && <Empty>سفارشی با این فیلتر نیست</Empty>}

      {orders.map((o) => {
        const st = statusOf(o, today);
        const ready = isOrderReady(o);
        const total = o.items.length * STAGES.length;
        const doneCount = o.items.reduce((s, it) => s + itemProgress(it), 0);
        return (
          <section
            key={o.id}
            className={"border-b border-[#E4DCC8] last:border-0 transition-colors " + (highlightId === o.id ? "bg-[#F0E4C8]" : "")}
          >
            {/* order row */}
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 pt-3 pb-2">
              <button onClick={() => onOpenOrder(o)} className="group flex items-center gap-2 text-right min-w-0">
                <PanelLeftOpen size={15} className="text-[#8A7B60] group-hover:text-[#3B241A] shrink-0" />
                <span className="text-sm font-bold group-hover:underline truncate">{o.customer}</span>
                <span className="text-xs text-[#8A7B60] shrink-0">{o.code}</span>
                {hasOpenDelay(o) && <AlertTriangle size={14} className="text-[#DC2626] shrink-0" aria-label="تأخیر دارد" />}
              </button>
              <div className="flex items-center gap-3 text-xs text-[#6B5E4F]">
                <span className="hidden sm:inline">تحویل: {faDate(o.requested)}</span>
                <span className="flex items-center gap-1.5" title={`${faNum(doneCount)} از ${faNum(total)} مرحله`}>
                  <span className="h-1.5 w-16 rounded-full bg-[#E4DCC8] overflow-hidden">
                    <span className="block h-full bg-[#16A34A]" style={{ width: `${(doneCount / Math.max(1, total)) * 100}%` }} />
                  </span>
                  {faNum(doneCount)}/{faNum(total)}
                </span>
                <span style={{ backgroundColor: toneColor[st.tone] }} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap">
                  {st.text}
                </span>
                {ready && canDeliver(role) && (
                  <button
                    onClick={() => actions.setDelivered(o, true)}
                    disabled={actions.busy}
                    className="flex items-center gap-1 rounded-md bg-[#16A34A] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                  >
                    <CheckCircle2 size={12} />
                    ثبت تحویل
                  </button>
                )}
              </div>
            </div>

            {/* item rows */}
            <div className="px-4 pb-3 flex flex-col gap-2">
              {o.items.map((it) => (
                <div key={it.id} className={"rounded-lg md:rounded-none md:bg-transparent bg-[#EFE8D8]/60 p-2 md:p-0 " + GRID}>
                  <div className="mb-2 md:mb-0 min-w-0 text-xs">
                    <div className="font-medium text-[#2B2420] truncate">
                      {it.productName} × {faNum(it.qty)}
                    </div>
                    {itemColors(it) && <div className="text-[11px] text-[#8A7B60] truncate">{itemColors(it)}</div>}
                  </div>
                  <div className="grid grid-cols-5 gap-1 md:contents">
                    {STAGES.map((s) => (
                      <div key={s} className="min-w-0">
                        <div className="md:hidden">
                          <StageCell item={it} stage={s} stageLabel={actions.label(s)} mine={role === s} onOpen={() => onOpenStage(o, it, s)} compact />
                        </div>
                        <div className="hidden md:block">
                          <StageCell item={it} stage={s} stageLabel={actions.label(s)} mine={role === s} onOpen={() => onOpenStage(o, it, s)} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:flex items-center gap-1 text-xs">
                    {it.production.ruyekoob ? (
                      <span className="flex items-center gap-1 text-[#166534]">
                        <CheckCircle2 size={13} />
                        {ready ? "آماده‌ی تحویل" : "منتظر بقیه"}
                      </span>
                    ) : (
                      <span className="text-[#C4B896] flex items-center">
                        <ChevronLeft size={13} />—
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
