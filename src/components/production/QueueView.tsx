"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, PanelLeftOpen } from "lucide-react";
import type { ProductionActions } from "./useProductionActions";
import { Empty, cardCls } from "../ui";
import { todayISO } from "@/lib/dates";
import { faDate, faDateFull, faNum } from "@/lib/format";
import { itemColors, openDelay, stageChangeError, stageState, statusOf, toneColor } from "@/lib/production";
import { DELAY_REASONS, canWorkStage, type Order, type OrderItem, type Role, type StageKey } from "@/lib/types";

type Row = { order: Order; item: OrderItem };

type Props = {
  orders: Order[];
  stage: StageKey;
  role: Role;
  actions: ProductionActions;
  onDelay: (order: Order, item: OrderItem, stage: StageKey) => void;
  onOpenOrder: (order: Order) => void;
};

// One station's to-do list: what can be worked on now, then what's on its way.
export default function QueueView({ orders, stage, role, actions, onDelay, onOpenOrder }: Props) {
  const [showWaiting, setShowWaiting] = useState(false);
  const today = todayISO();
  const mine = canWorkStage(role, stage);
  const rows: Row[] = orders.flatMap((order) => order.items.map((item) => ({ order, item })));
  const byDue = (a: Row, b: Row) => a.order.requested.localeCompare(b.order.requested) || a.order.id - b.order.id;
  const now = rows
    .filter(({ item }) => {
      const s = stageState(item, stage);
      return s === "active" || (s === "delayed" && !stageChangeError(item.production, stage, true));
    })
    .sort(byDue);
  const later = rows
    .filter(({ item }) => {
      const s = stageState(item, stage);
      return s === "waiting" || (s === "delayed" && !!stageChangeError(item.production, stage, true));
    })
    .sort(byDue);

  const card = ({ order, item }: Row, canFinish: boolean) => {
    const st = statusOf(order, today);
    const delay = openDelay(item, stage);
    return (
      <div key={`${order.id}-${item.id}`} className={cardCls + " p-4 " + (delay ? "!border-[#FCA5A5]" : "")}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <button onClick={() => onOpenOrder(order)} className="text-right flex items-center gap-1.5 min-w-0">
            <PanelLeftOpen size={14} className="text-[#8A7B60] shrink-0" />
            <span className="text-sm font-bold truncate">{order.customer}</span>
            <span className="text-xs text-[#8A7B60] shrink-0">{order.code}</span>
          </button>
          <span style={{ backgroundColor: toneColor[st.tone] }} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap">
            {st.text}
          </span>
        </div>
        <div className="text-base font-semibold text-[#2B2420]">
          {item.productName} × {faNum(item.qty)}
        </div>
        {itemColors(item) && <div className="text-sm text-[#6B5E4F]">{itemColors(item)}</div>}
        {order.notes && <div className="text-xs text-[#8A7B60] mt-1">{order.notes}</div>}
        <div className="text-xs text-[#6B5E4F] mt-1">قول تحویل: {faDate(order.requested)}</div>

        {delay && (
          <div className="mt-2 rounded-lg bg-[#FEE2E2] px-3 py-2 text-xs text-[#991B1B]">
            <div className="flex items-center gap-1 font-semibold">
              <AlertTriangle size={13} />
              {DELAY_REASONS[delay.reason]}
            </div>
            {delay.note && <div className="mt-0.5">{delay.note}</div>}
            {delay.eta && <div className="mt-0.5">تخمین: {faDateFull(delay.eta)}</div>}
          </div>
        )}

        {mine && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={!canFinish || actions.busy}
              onClick={() => actions.setStage(order, item, stage, true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#3B241A] py-3 text-sm font-semibold text-[#F3EEE1] disabled:opacity-40"
            >
              <CheckCircle2 size={16} />
              تمام شد
            </button>
            <button
              onClick={() => onDelay(order, item, stage)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FFF7F7] py-3 text-sm font-semibold text-[#991B1B]"
            >
              <AlertTriangle size={16} />
              {delay ? "ویرایش تأخیر" : "تأخیر دارد"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-bold mb-2">
          نوبت {actions.label(stage)} ({faNum(now.length)})
        </h2>
        {now.length === 0 ? (
          <div className={cardCls}>
            <Empty>الان کاری برای {actions.label(stage)} نیست</Empty>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{now.map((r) => card(r, true))}</div>
        )}
      </div>

      {later.length > 0 && (
        <div>
          <button onClick={() => setShowWaiting((v) => !v)} className="flex items-center gap-1 text-sm font-bold mb-2">
            <ChevronDown size={16} className={"transition-transform " + (showWaiting ? "rotate-180" : "")} />
            در راه — منتظر مرحله‌های قبلی ({faNum(later.length)})
          </button>
          {showWaiting && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-80">{later.map((r) => card(r, false))}</div>}
        </div>
      )}
    </div>
  );
}
