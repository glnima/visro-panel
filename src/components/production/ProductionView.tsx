"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Columns3, ListTodo, Search, Table2, Truck } from "lucide-react";
import BoardView from "./BoardView";
import OrderDrawer from "./OrderDrawer";
import QueueView from "./QueueView";
import { STATE_STYLE } from "./StageCell";
import StageDialog from "./StageDialog";
import TrackerView from "./TrackerView";
import { useProductionActions } from "./useProductionActions";
import { stationIcons } from "../stationIcons";
import { PageTitle } from "../ui";
import { addDays, todayISO } from "@/lib/dates";
import { faNum } from "@/lib/format";
import { capacityColor, groupByStation, hasOpenDelay, isDelivered, isOrderReady, stageState } from "@/lib/production";
import { STAGES, isStationRole, type Bootstrap, type Order, type OrderItem, type StageKey, type StationKey } from "@/lib/types";

type View = "table" | "board" | "queue";
type Quick = "all" | "delayed" | "late" | "soon" | "ready";

const QUICK: { key: Quick; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "delayed", label: "تأخیردار" },
  { key: "late", label: "عقب‌افتاده" },
  { key: "soon", label: "تحویل تا ۳ روز" },
  { key: "ready", label: "آماده‌ی تحویل" },
];

const VIEW_KEY = "mizan:production-view";

function savedView(fallback: View): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "table" || v === "board" || v === "queue" ? v : fallback;
  } catch {
    return fallback;
  }
}

type Props = { data: Bootstrap; refresh: () => Promise<void>; highlightId: number | null; openOrderId?: number | null };

export default function ProductionView({ data, refresh, highlightId, openOrderId }: Props) {
  const { me, stations } = data;
  const ownStage = isStationRole(me.role) ? me.role : null;
  const actions = useProductionActions(data, refresh);
  const [view, setViewState] = useState<View>(() => savedView(ownStage ? "queue" : "table"));
  const [station, setStation] = useState<StationKey | "all">(ownStage ?? "all");
  const [quick, setQuick] = useState<Quick>("all");
  const [query, setQuery] = useState("");
  const [stageDialog, setStageDialog] = useState<{ orderId: number; itemId: number; stage: StageKey; delay?: boolean } | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(openOrderId ?? null);
  const today = todayISO();

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // per-viewer convenience only
    }
  };

  const open = useMemo(() => data.orders.filter((o) => !isDelivered(o)), [data.orders]);
  const groups = useMemo(() => groupByStation(open), [open]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const atStation = (o: Order) =>
      station === "all" ||
      (station === "final"
        ? isOrderReady(o)
        : o.items.some((it) => ["active", "delayed"].includes(stageState(it, station))));
    const quickOk = (o: Order) =>
      quick === "all" ||
      (quick === "delayed" && hasOpenDelay(o)) ||
      (quick === "late" && o.requested < today) ||
      (quick === "soon" && o.requested >= today && o.requested <= addDays(today, 3)) ||
      (quick === "ready" && isOrderReady(o));
    return open
      .filter((o) => !q || o.customer.includes(q) || o.code.toLowerCase().includes(q.toLowerCase()) || o.items.some((it) => it.productName.includes(q)))
      .filter(quickOk)
      .filter((o) => view === "board" || view === "queue" || atStation(o))
      .sort((a, b) => a.requested.localeCompare(b.requested) || a.id - b.id);
  }, [open, query, quick, station, view, today]);

  const find = (orderId: number) => data.orders.find((o) => o.id === orderId);
  const openStage = (order: Order, item: OrderItem, stage: StageKey, delay = false) =>
    setStageDialog({ orderId: order.id, itemId: item.id, stage, delay });

  const dialogOrder = stageDialog ? find(stageDialog.orderId) : undefined;
  const dialogItem = dialogOrder?.items.find((i) => i.id === stageDialog?.itemId);
  const drawerOrder = drawerId !== null ? find(drawerId) : undefined;
  const queueStage: StageKey = station !== "all" && station !== "final" ? station : ownStage ?? "carpentry";
  const bottlenecks = stations.filter((s) => groups[s.key].length / s.capacity >= 1);
  const delayedCount = open.filter(hasOpenDelay).length;

  const viewBtn = (v: View, label: string, Icon: typeof Table2) => (
    <button
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors " +
        (view === v ? "bg-[#FBF8F1] text-[#2B2420] font-semibold shadow-sm" : "text-[#6B5E4F] hover:text-[#2B2420]")
      }
    >
      <Icon size={15} />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title={ownStage ? `خط تولید — ${actions.label(ownStage)}` : "خط تولید"}
        subtitle={
          ownStage
            ? "کارهای ایستگاه خودت رو تمام کن یا اگه گیر داره، دلیل تأخیر رو ثبت کن. بقیه‌ی مراحل رو فقط می‌بینی."
            : "هر سفارش از ثبت تا تحویل — روی هر مرحله بزن تا جزئیات، تأخیر و تاریخچه‌ش رو ببینی"
        }
      />

      {/* station load strip; tap to filter */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {stations.map((s) => {
          const list = groups[s.key];
          const ratio = list.length / s.capacity;
          const delayed = s.key === "final" ? 0 : list.filter((c) => c.item && c.item.delays.some((d) => d.stage === s.key)).length;
          const Icon = s.key === "final" ? Truck : stationIcons[s.key];
          const selected = station === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setStation(selected && !ownStage ? "all" : s.key)}
              aria-pressed={selected}
              className={
                "text-right rounded-xl border bg-[#F7F2E7] p-2.5 transition-shadow hover:shadow-sm " +
                (selected ? "border-[#9C7A3C] ring-2 ring-[#9C7A3C]/30" : "border-[#D9CDB6]")
              }
            >
              <div className="flex items-center justify-between mb-1.5">
                <Icon size={15} className="text-[#6B5E4F]" />
                <span className="text-xs font-semibold">{s.label}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#E4DCC8] overflow-hidden mb-1">
                <div className="h-full rounded-full" style={{ width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: capacityColor(ratio) }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#6B5E4F]">
                <span>
                  {faNum(list.length)} از {faNum(s.capacity)}
                </span>
                {delayed > 0 && (
                  <span className="flex items-center gap-0.5 text-[#991B1B] font-semibold">
                    <AlertTriangle size={11} />
                    {faNum(delayed)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {bottlenecks.length > 0 && (
        <div className="flex items-center gap-2 text-sm bg-[#DC2626] text-white rounded-lg px-4 py-2">
          <AlertTriangle size={16} className="shrink-0" />
          {bottlenecks.map((s) => s.label).join(" و ")} از ظرفیت پر شده
          {delayedCount > 0 && `؛ ${faNum(delayedCount)} سفارش تأخیر داره`}
        </div>
      )}

      {/* toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex w-max rounded-lg bg-[#E4DCC8] p-1 gap-0.5">
          {viewBtn("table", "جدول", Table2)}
          {viewBtn("board", "تابلو", Columns3)}
          {viewBtn("queue", ownStage ? "کارهای من" : "صف ایستگاه", ListTodo)}
        </div>
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
          <Search size={15} className="text-[#8A7B60]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی مشتری، شماره سفارش یا مدل"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK.map((f) => (
          <button
            key={f.key}
            onClick={() => setQuick(f.key)}
            aria-pressed={quick === f.key}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (quick === f.key ? "bg-[#3B241A] border-[#3B241A] text-[#F3EEE1]" : "bg-[#FBF8F1] border-[#D9CDB6] text-[#4A2E22]")
            }
          >
            {f.label}
          </button>
        ))}
        {station !== "all" && view === "table" && (
          <button onClick={() => setStation("all")} className="rounded-full border border-[#9C7A3C] bg-[#F0E4C8] px-3 py-1 text-xs">
            ایستگاه: {actions.label(station)} ✕
          </button>
        )}
        {view === "queue" && !ownStage && (
          <select
            aria-label="ایستگاه"
            value={queueStage}
            onChange={(e) => setStation(e.target.value as StageKey)}
            className="rounded-full border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-1 text-xs"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{actions.label(s)}</option>
            ))}
          </select>
        )}
      </div>

      {view === "table" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6B5E4F]" aria-label="راهنما">
          {(Object.keys(STATE_STYLE) as (keyof typeof STATE_STYLE)[]).map((k) => {
            const { label, Icon, cls } = STATE_STYLE[k];
            return (
              <span key={k} className="flex items-center gap-1">
                <span className={"flex h-5 w-5 items-center justify-center rounded border " + cls}>
                  <Icon size={12} />
                </span>
                {label}
              </span>
            );
          })}
        </div>
      )}
      {view === "table" && (
        <TrackerView
          orders={filtered}
          role={me.role}
          actions={actions}
          highlightId={highlightId}
          onOpenStage={(o, it, s) => openStage(o, it, s)}
          onOpenOrder={(o) => setDrawerId(o.id)}
        />
      )}
      {view === "board" && (
        <BoardView
          orders={filtered}
          stations={stations}
          role={me.role}
          actions={actions}
          highlightId={highlightId}
          onOpenOrder={(o) => setDrawerId(o.id)}
          onOpenStage={(o, it, s) => openStage(o, it, s, true)}
        />
      )}
      {view === "queue" && (
        <QueueView
          orders={filtered}
          stage={queueStage}
          role={me.role}
          actions={actions}
          onDelay={(o, it, s) => openStage(o, it, s, true)}
          onOpenOrder={(o) => setDrawerId(o.id)}
        />
      )}

      {stageDialog && dialogOrder && dialogItem && (
        <StageDialog
          key={`${stageDialog.itemId}-${stageDialog.stage}`}
          order={dialogOrder}
          item={dialogItem}
          stage={stageDialog.stage}
          role={me.role}
          actions={actions}
          startWithDelay={stageDialog.delay}
          onClose={() => setStageDialog(null)}
        />
      )}
      {drawerOrder && (
        <OrderDrawer
          order={drawerOrder}
          role={me.role}
          version={data.version}
          actions={actions}
          onOpenStage={(o, it, s) => openStage(o, it, s)}
          onClose={() => setDrawerId(null)}
        />
      )}
    </div>
  );
}
