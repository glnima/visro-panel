"use client";

import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { stationIcons } from "./stationIcons";
import { faDate, faNum } from "@/lib/format";
import { STATIONS, capacityColor, isLastBlocker, orderTotals, statusOf, toneColor } from "@/lib/production";
import type { Order, StageKey, StationKey } from "@/lib/types";

type Props = {
  stationOrders: Record<StationKey, Order[]>;
  highlightId: string | null;
  confirmDeleteId: string | null;
  onAdvance: (id: string, key: StageKey) => void;
  onDeliver: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function WorkshopView({
  stationOrders,
  highlightId,
  confirmDeleteId,
  onAdvance,
  onDeliver,
  onDelete,
}: Props) {
  const bottlenecks = STATIONS.filter((s) => stationOrders[s.key].length / s.capacity >= 1);

  return (
    <div>
      <h1 className="text-lg font-bold mb-1">خط تولید</h1>
      <p className="text-sm text-[#6B5E4F] mb-4">نجاری به زیرکار و رنگکار جدا می‌شه؛ خیاط مستقیم می‌ره پیش رویه‌کوب</p>

      {bottlenecks.length > 0 && (
        <div className="mb-5 flex items-center gap-2 text-sm bg-[#DC2626] text-white rounded-lg px-4 py-2.5">
          <AlertTriangle size={16} />
          {bottlenecks.map((s) => s.label).join(" و ")} از ظرفیت پر شده — سفارش‌های جدید ممکن است دیر برسند
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {STATIONS.map((s) => {
          const count = stationOrders[s.key].length;
          const ratio = count / s.capacity;
          const Icon = stationIcons[s.key];
          return (
            <div key={s.key} className="rounded-xl border border-[#D9CDB6] bg-[#F7F2E7] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <Icon size={16} className="text-[#6B5E4F]" />
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#E4DCC8] overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: capacityColor(ratio) }}
                />
              </div>
              <span className="text-xs text-[#6B5E4F]">{faNum(count)} از {faNum(s.capacity)} ظرفیت</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {STATIONS.map((s) => {
          const Icon = stationIcons[s.key];
          const list = stationOrders[s.key];
          return (
            <div key={s.key} className="rounded-xl bg-[#E4DCC8] p-3 min-h-[140px]">
              <div className="flex items-center gap-1.5 px-1 mb-3 text-sm font-semibold text-[#4A2E22]">
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
                {list.map((o) => {
                  const st = statusOf(o);
                  const totals = orderTotals(o);
                  const lastBlocker = isLastBlocker(o.production, s.key);
                  return (
                    <div
                      key={o.id}
                      style={{
                        borderWidth: lastBlocker ? "3px" : "2px",
                        borderColor: lastBlocker ? "#8B5CF6" : toneColor[st.tone],
                        borderStyle: "solid",
                        backgroundColor: lastBlocker ? "#F3E8FF" : "#F7F2E7",
                      }}
                      className={
                        "rounded-lg p-3 transition-shadow " +
                        (highlightId === o.id ? "ring-2 ring-[#9C7A3C]/40" : "")
                      }
                    >
                      {lastBlocker && (
                        <div className="text-[11px] font-semibold text-[#7C3AED] mb-1">
                          فقط منتظر همینه — بقیه آماده‌ست
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#6B5E4F]">{o.id}</span>
                        <div className="flex items-center gap-2">
                          <span
                            style={{ backgroundColor: toneColor[st.tone] }}
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                          >
                            {st.text}
                          </span>
                          <button
                            onClick={() => onDelete(o.id)}
                            title={confirmDeleteId === o.id ? "برای حذف قطعی دوباره بزن" : "حذف سفارش"}
                            className={
                              "transition-colors " +
                              (confirmDeleteId === o.id
                                ? "text-[#8A3C2F] font-semibold"
                                : "text-[#8A7B60] hover:text-[#8A3C2F]")
                            }
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm font-medium mb-0.5">{o.customer}</div>
                      <div className="text-xs text-[#6B5E4F] mb-1">{totals.summary}</div>
                      <div className="text-xs text-[#6B5E4F] mb-2">تحویل: {faDate(o.requested)}</div>
                      {o.items.some((it) => it.fabricColor || it.woodColor) && (
                        <div className="text-[11px] text-[#8A7B60] mb-2">
                          {o.items
                            .filter((it) => it.fabricColor || it.woodColor)
                            .map(
                              (it) =>
                                `${it.productName}: ${[it.fabricColor && `پارچه ${it.fabricColor}`, it.woodColor && `چوب ${it.woodColor}`]
                                  .filter(Boolean)
                                  .join(" / ")}`
                            )
                            .join(" · ")}
                        </div>
                      )}
                      {o.notes && <div className="text-[11px] text-[#8A7B60] mb-2">{o.notes}</div>}
                      {s.key !== "final" ? (
                        <button
                          onClick={() => onAdvance(o.id, s.key as StageKey)}
                          className="flex items-center justify-center gap-1 w-full rounded-md bg-[#3B241A] text-[#F3EEE1] text-xs p-1.5"
                        >
                          {s.label} تمام شد
                          <CheckCircle2 size={12} />
                        </button>
                      ) : (
                        <button
                          onClick={() => onDeliver(o.id)}
                          className="flex items-center justify-center gap-1 w-full rounded-md bg-[#16A34A] text-white text-xs p-1.5"
                        >
                          ثبت تحویل
                          <CheckCircle2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
