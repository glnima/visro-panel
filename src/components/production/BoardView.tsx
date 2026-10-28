"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ProductionActions } from "./useProductionActions";
import { stationIcons } from "../stationIcons";
import { todayISO } from "@/lib/dates";
import { faDate, faNum } from "@/lib/format";
import { groupByStation, isLastBlocker, itemColors, openDelay, statusOf, toneColor, type Card } from "@/lib/production";
import { DELAY_REASONS, canDeliver, canWorkStage, type Order, type OrderItem, type Role, type StageKey, type Station, type StationKey } from "@/lib/types";

type Props = {
  orders: Order[];
  stations: Station[];
  role: Role;
  actions: ProductionActions;
  highlightId: number | null;
  onOpenOrder: (order: Order) => void;
  onOpenStage: (order: Order, item: OrderItem, stage: StageKey) => void;
};

// Kanban: one column per station, one card per item (whole orders in the final column).
export default function BoardView({ orders, stations, role, actions, highlightId, onOpenOrder, onOpenStage }: Props) {
  const groups = useMemo(() => groupByStation(orders), [orders]);
  const [mobileStation, setMobileStation] = useState<StationKey>("carpentry");

  const column = (s: Station) => {
    const Icon = stationIcons[s.key];
    const list = groups[s.key];
    return (
      <div key={s.key} className="rounded-xl bg-[#E4DCC8] p-3 min-h-[140px]">
        <div className="hidden md:flex items-center gap-1.5 px-1 mb-3 text-sm font-semibold text-[#4A2E22]">
          <Icon size={15} />
          {s.label}
          <span className="text-xs font-normal text-[#6B5E4F]">({faNum(list.length)})</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {list.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#C4B896] px-3 py-6 text-center text-xs text-[#8A7B60]">
              سفارشی در این مرحله نیست
            </div>
          )}
          {list.map((card) => (
            <BoardCard
              key={`${card.order.id}-${card.item?.id ?? "order"}`}
              card={card}
              station={s}
              role={role}
              actions={actions}
              highlighted={highlightId === card.order.id}
              onOpenOrder={onOpenOrder}
              onOpenStage={onOpenStage}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="md:hidden mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {stations.map((s) => (
          <button
            key={s.key}
            onClick={() => setMobileStation(s.key)}
            className={
              "shrink-0 rounded-full border px-3 py-1 text-xs " +
              (mobileStation === s.key ? "bg-[#3B241A] border-[#3B241A] text-[#F3EEE1]" : "bg-[#FBF8F1] border-[#D9CDB6]")
            }
          >
            {s.label} ({faNum(groups[s.key].length)})
          </button>
        ))}
      </div>
      <div className="md:hidden">{column(stations.find((s) => s.key === mobileStation) ?? stations[0])}</div>
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">{stations.map(column)}</div>
    </div>
  );
}

type CardProps = {
  card: Card;
  station: Station;
  role: Role;
  actions: ProductionActions;
  highlighted: boolean;
  onOpenOrder: (order: Order) => void;
  onOpenStage: (order: Order, item: OrderItem, stage: StageKey) => void;
};

function BoardCard({ card, station, role, actions, highlighted, onOpenOrder, onOpenStage }: CardProps) {
  const { order, item } = card;
  const st = statusOf(order, todayISO());
  const stage = station.key === "final" ? null : station.key;
  const lastBlocker = item && stage ? isLastBlocker(item.production, stage) : false;
  const delay = item && stage ? openDelay(item, stage) : undefined;
  const itemIndex = item ? order.items.findIndex((i) => i.id === item.id) : -1;

  return (
    <div
      style={{
        borderWidth: lastBlocker || delay ? "3px" : "2px",
        borderColor: delay ? "#DC2626" : lastBlocker ? "#8B5CF6" : toneColor[st.tone],
        borderStyle: "solid",
        backgroundColor: delay ? "#FFF7F7" : lastBlocker ? "#F3E8FF" : "#F7F2E7",
      }}
      className={"rounded-lg p-3 transition-shadow " + (highlighted ? "ring-2 ring-[#9C7A3C]/40" : "")}
    >
      {delay && (
        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[#991B1B]">
          <AlertTriangle size={12} />
          تأخیر: {DELAY_REASONS[delay.reason]}
        </div>
      )}
      {!delay && lastBlocker && <div className="text-[11px] font-semibold text-[#7C3AED] mb-1">فقط منتظر همینه — بقیه آماده‌ست</div>}
      <button onClick={() => onOpenOrder(order)} className="block w-full text-right">
        <div className="flex items-start justify-between flex-wrap mb-1 gap-x-2 gap-y-1">
          <span className="text-xs text-[#6B5E4F]">
            {order.code}
            {item && order.items.length > 1 && ` — قلم ${faNum(itemIndex + 1)} از ${faNum(order.items.length)}`}
          </span>
          <span style={{ backgroundColor: toneColor[st.tone] }} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white whitespace-nowrap">
            {st.text}
          </span>
        </div>
        <div className="text-sm font-medium mb-0.5 hover:underline">{order.customer}</div>
        {item ? (
          <>
            <div className="text-xs text-[#2B2420] mb-1">
              {item.productName} × {faNum(item.qty)}
            </div>
            {itemColors(item) && <div className="text-[11px] text-[#8A7B60] mb-1">{itemColors(item)}</div>}
          </>
        ) : (
          <ul className="text-xs text-[#2B2420] mb-1 list-disc pr-4">
            {order.items.map((it) => (
              <li key={it.id}>
                {it.productName} × {faNum(it.qty)}
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs text-[#6B5E4F] mb-2">تحویل: {faDate(order.requested)}</div>
      </button>

      {item && stage && canWorkStage(role, stage) && (
        <div className="grid grid-cols-[1fr_auto] gap-1.5">
          <button
            disabled={actions.busy}
            onClick={() => actions.setStage(order, item, stage, true)}
            className="flex items-center justify-center gap-1 rounded-md bg-[#3B241A] text-[#F3EEE1] text-xs py-2 disabled:opacity-60"
          >
            {station.label} تمام شد
            <CheckCircle2 size={12} />
          </button>
          <button
            onClick={() => onOpenStage(order, item, stage)}
            title="تأخیر یا جزئیات"
            aria-label="تأخیر یا جزئیات"
            className="rounded-md border border-[#FCA5A5] bg-[#FFF7F7] px-2 text-[#991B1B]"
          >
            <AlertTriangle size={13} />
          </button>
        </div>
      )}
      {!item && canDeliver(role) && (
        <button
          disabled={actions.busy}
          onClick={() => actions.setDelivered(order, true)}
          className="flex items-center justify-center gap-1 w-full rounded-md bg-[#16A34A] text-white text-xs py-2 disabled:opacity-60"
        >
          ثبت تحویل
          <CheckCircle2 size={12} />
        </button>
      )}
    </div>
  );
}
