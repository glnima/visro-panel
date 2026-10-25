"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ListChecks, Printer } from "lucide-react";
import { stationIcons } from "./stationIcons";
import { useToast } from "./Toast";
import { PageTitle } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { faDate, faNum } from "@/lib/format";
import {
  capacityColor,
  groupByStation,
  isLastBlocker,
  itemColors,
  nextStepMessage,
  stageChangeError,
  statusOf,
  toneColor,
  type Card,
} from "@/lib/production";
import { STAGES, type Bootstrap, type Order, type StageKey, type Station, type StationKey } from "@/lib/types";

type Props = {
  data: Bootstrap;
  refresh: () => Promise<void>;
  highlightId: number | null;
};

export default function WorkshopView({ data, refresh, highlightId }: Props) {
  const toast = useToast();
  const { stations, me } = data;
  const canWork = me.role === "admin" || me.role === "workshop";
  const groups = useMemo(() => groupByStation(data.orders), [data.orders]);
  const [mobileStation, setMobileStation] = useState<StationKey>("carpentry");
  const [busy, setBusy] = useState(false);
  const label = (k: StationKey) => stations.find((s) => s.key === k)?.label ?? k;
  const bottlenecks = stations.filter((s) => groups[s.key].length / s.capacity >= 1);

  const setStage = async (order: Order, itemId: number, stage: StageKey, done: boolean, withUndo = true) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ order: Order }>("POST", `/api/items/${itemId}/stage`, { stage, done });
      await refresh();
      const item = res.order.items.find((i) => i.id === itemId);
      const next = item ? nextStepMessage(item.production, stations) : "";
      const text = done
        ? `${label(stage)} ${item?.productName ?? ""} (${order.code}) تمام شد${next ? " — " + next : ""}`
        : `${label(stage)} ${item?.productName ?? ""} (${order.code}) برگشت`;
      toast.ok(text, withUndo ? { label: "واگرد", run: () => setStage(order, itemId, stage, !done, false) } : undefined);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setDelivered = async (order: Order, delivered: boolean, withUndo = true) => {
    if (busy) return;
    setBusy(true);
    try {
      await api("POST", `/api/orders/${order.id}/deliver`, { delivered });
      await refresh();
      toast.ok(
        delivered ? `سفارش ${order.code} تحویل داده شد` : `تحویل سفارش ${order.code} برگشت`,
        withUndo ? { label: "واگرد", run: () => setDelivered(order, !delivered, false) } : undefined
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

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
            <WorkCard
              key={`${card.order.id}-${card.item?.id ?? "order"}`}
              card={card}
              station={s}
              stations={stations}
              highlighted={highlightId === card.order.id}
              canWork={canWork}
              busy={busy}
              onStage={setStage}
              onDeliver={(o) => setDelivered(o, true)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageTitle title="خط تولید" subtitle="نجاری به زیرکار و رنگکار جدا می‌شه؛ خیاط از روز اول موازی کار می‌کنه — هر قلم سفارش جدا پیش می‌ره" />

      {bottlenecks.length > 0 && (
        <div className="mb-5 flex items-center gap-2 text-sm bg-[#DC2626] text-white rounded-lg px-4 py-2.5">
          <AlertTriangle size={16} className="shrink-0" />
          {bottlenecks.map((s) => s.label).join(" و ")} از ظرفیت پر شده — سفارش‌های جدید ممکن است دیر برسند
        </div>
      )}

      {/* capacity cards; on phones they double as the station picker */}
      <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-4 md:mb-6">
        {stations.map((s) => {
          const count = groups[s.key].length;
          const ratio = count / s.capacity;
          const Icon = stationIcons[s.key];
          const selected = mobileStation === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setMobileStation(s.key)}
              className={
                "text-right rounded-xl border bg-[#F7F2E7] p-2.5 md:p-3.5 md:cursor-default " +
                (selected ? "border-[#9C7A3C] ring-2 ring-[#9C7A3C]/30 md:ring-0 md:border-[#D9CDB6]" : "border-[#D9CDB6]")
              }
            >
              <div className="flex items-center justify-between mb-2">
                <Icon size={16} className="text-[#6B5E4F]" />
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#E4DCC8] overflow-hidden mb-1.5">
                <div className="h-full rounded-full" style={{ width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: capacityColor(ratio) }} />
              </div>
              <span className="text-[11px] md:text-xs text-[#6B5E4F]">
                {faNum(count)} از {faNum(s.capacity)}
                <span className="hidden md:inline"> ظرفیت</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="md:hidden">
        <div className="mb-2 px-1 text-sm font-semibold text-[#4A2E22]">{label(mobileStation)}</div>
        {column(stations.find((s) => s.key === mobileStation) ?? stations[0])}
      </div>
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">{stations.map(column)}</div>
    </div>
  );
}

type CardProps = {
  card: Card;
  station: Station;
  stations: Station[];
  highlighted: boolean;
  canWork: boolean;
  busy: boolean;
  onStage: (order: Order, itemId: number, stage: StageKey, done: boolean) => void;
  onDeliver: (order: Order) => void;
};

function WorkCard({ card, station, stations, highlighted, canWork, busy, onStage, onDeliver }: CardProps) {
  const { order, item } = card;
  const [showStages, setShowStages] = useState(false);
  const st = statusOf(order, todayISO());
  const lastBlocker = item ? isLastBlocker(item.production, station.key) : false;
  const itemIndex = item ? order.items.findIndex((i) => i.id === item.id) : -1;
  const label = (k: StationKey) => stations.find((s) => s.key === k)?.label ?? k;

  return (
    <div
      style={{
        borderWidth: lastBlocker ? "3px" : "2px",
        borderColor: lastBlocker ? "#8B5CF6" : toneColor[st.tone],
        borderStyle: "solid",
        backgroundColor: lastBlocker ? "#F3E8FF" : "#F7F2E7",
      }}
      className={"rounded-lg p-3 transition-shadow " + (highlighted ? "ring-2 ring-[#9C7A3C]/40" : "")}
    >
      {lastBlocker && <div className="text-[11px] font-semibold text-[#7C3AED] mb-1">فقط منتظر همینه — بقیه آماده‌ست</div>}
      <div className="flex items-start justify-between flex-wrap mb-1 gap-x-2 gap-y-1">
        <span className="text-xs text-[#6B5E4F]">
          {order.code}
          {item && order.items.length > 1 && ` · قلم ${faNum(itemIndex + 1)} از ${faNum(order.items.length)}`}
        </span>
        <span style={{ backgroundColor: toneColor[st.tone] }} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white whitespace-nowrap">
          {st.text}
        </span>
      </div>
      <div className="text-sm font-medium mb-0.5">{order.customer}</div>
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
              {itemColors(it) && <span className="text-[11px] text-[#8A7B60]"> — {itemColors(it)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="text-xs text-[#6B5E4F] mb-2">تحویل: {faDate(order.requested)}</div>
      {order.notes && <div className="text-[11px] text-[#8A7B60] mb-2">{order.notes}</div>}

      {item && canWork && station.key !== "final" && (
        <button
          disabled={busy}
          onClick={() => onStage(order, item.id, station.key as StageKey, true)}
          className="flex items-center justify-center gap-1 w-full rounded-md bg-[#3B241A] text-[#F3EEE1] text-xs py-2 disabled:opacity-60"
        >
          {station.label} تمام شد
          <CheckCircle2 size={12} />
        </button>
      )}
      {!item && (
        <button
          disabled={busy}
          onClick={() => onDeliver(order)}
          className="flex items-center justify-center gap-1 w-full rounded-md bg-[#16A34A] text-white text-xs py-2 disabled:opacity-60"
        >
          ثبت تحویل
          <CheckCircle2 size={12} />
        </button>
      )}

      <div className="mt-2 flex items-center justify-between">
        {item && canWork ? (
          <button onClick={() => setShowStages((v) => !v)} className="text-[11px] text-[#7A5E28] flex items-center gap-1">
            <ListChecks size={12} />
            مراحل این قلم
          </button>
        ) : (
          <span />
        )}
        <a href={`/print/${order.code}`} target="_blank" rel="noreferrer" className="text-[11px] text-[#7A5E28] flex items-center gap-1">
          <Printer size={12} />
          برگه‌ی کارگاه
        </a>
      </div>

      {item && canWork && showStages && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STAGES.map((s) => {
            const done = item.production[s];
            const blocked = stageChangeError(item.production, s, !done);
            return (
              <button
                key={s}
                disabled={busy || !!blocked}
                title={blocked ?? (done ? "برگردوندن این مرحله" : "تمام شدن این مرحله")}
                onClick={() => onStage(order, item.id, s, !done)}
                className={
                  "rounded-full px-2 py-0.5 text-[11px] border disabled:opacity-40 " +
                  (done ? "bg-[#16A34A] border-[#15803D] text-white" : "bg-[#FBF8F1] border-[#D9CDB6] text-[#6B5E4F]")
                }
              >
                {done ? "✓ " : ""}
                {label(s)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
