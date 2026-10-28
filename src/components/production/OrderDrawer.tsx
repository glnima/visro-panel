"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Printer, X } from "lucide-react";
import { STATE_STYLE } from "./StageCell";
import type { ProductionActions } from "./useProductionActions";
import { api, errorMessage, printUrl } from "@/lib/api";
import { localDate, todayISO } from "@/lib/dates";
import { EVENT_LABELS, delayReasonText } from "@/lib/events";
import { faDate, faDateFull, faNum, faTime } from "@/lib/format";
import { isOrderReady, itemColors, openDelay, stageState, statusOf, toneColor } from "@/lib/production";
import { DELAY_REASONS, STAGES, canDeliver, type Order, type OrderEvent, type OrderItem, type Role, type StageKey } from "@/lib/types";

type Props = {
  order: Order;
  role: Role;
  version: number;
  actions: ProductionActions;
  onOpenStage: (order: Order, item: OrderItem, stage: StageKey) => void;
  onClose: () => void;
};

// Side panel with the whole story of one order: per-item pipeline and timeline.
export default function OrderDrawer({ order, role, version, actions, onOpenStage, onClose }: Props) {
  const [events, setEvents] = useState<OrderEvent[] | null>(null);
  const [error, setError] = useState("");
  const st = statusOf(order, todayISO());

  useEffect(() => {
    let cancelled = false;
    api<{ events: OrderEvent[] }>("GET", `/api/orders/${order.id}/timeline`)
      .then((r) => !cancelled && setEvents(r.events))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [order.id, version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`سفارش ${order.code}`}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full sm:max-w-xl overflow-y-auto bg-[#FBF8F1] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#E4DCC8] bg-[#FBF8F1]/95 px-5 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-xs text-[#8A7B60]">{order.code}</div>
            <div className="text-lg font-bold truncate">{order.customer}</div>
          </div>
          <button onClick={onClose} aria-label="بستن" className="rounded-md p-1.5 text-[#8A7B60] hover:bg-[#EDE6D6]">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">
          {/* properties, Notion-style */}
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            <dt className="text-[#8A7B60]">وضعیت</dt>
            <dd>
              <span style={{ backgroundColor: toneColor[st.tone] }} className="rounded-full px-2 py-0.5 text-xs font-medium text-white">
                {st.text}
              </span>
            </dd>
            <dt className="text-[#8A7B60]">تاریخ سفارش</dt>
            <dd>{faDateFull(order.orderDate)}</dd>
            <dt className="text-[#8A7B60]">قول تحویل</dt>
            <dd>{faDateFull(order.requested)}</dd>
            {order.deliveredAt && (
              <>
                <dt className="text-[#8A7B60]">تحویل شد</dt>
                <dd>{faDateFull(order.deliveredAt)}</dd>
              </>
            )}
            {order.notes && (
              <>
                <dt className="text-[#8A7B60]">توضیحات</dt>
                <dd className="whitespace-pre-wrap">{order.notes}</dd>
              </>
            )}
          </dl>

          <div className="flex flex-wrap gap-2">
            {!order.deliveredAt && isOrderReady(order) && canDeliver(role) && (
              <button
                onClick={() => actions.setDelivered(order, true)}
                disabled={actions.busy}
                className="flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <CheckCircle2 size={15} />
                ثبت تحویل
              </button>
            )}
            <a href={printUrl(order.code)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-[#D9CDB6] px-4 py-2 text-sm text-[#3B241A]">
              <Printer size={15} />
              برگه‌ی کارگاه
            </a>
          </div>

          {/* per-item pipeline */}
          <section>
            <h3 className="text-sm font-bold mb-2">اقلام و مراحل</h3>
            <div className="flex flex-col gap-3">
              {order.items.map((it) => (
                <div key={it.id} className="rounded-xl border border-[#E4DCC8] bg-white/60 p-3">
                  <div className="text-sm font-semibold">
                    {it.productName} × {faNum(it.qty)}
                  </div>
                  {itemColors(it) && <div className="text-xs text-[#8A7B60]">{itemColors(it)}</div>}
                  <ol className="mt-3 flex flex-col gap-1.5">
                    {STAGES.map((s) => {
                      const state = stageState(it, s);
                      const { cls, label, Icon } = STATE_STYLE[state];
                      const done = it.done[s];
                      const delay = openDelay(it, s);
                      return (
                        <li key={s}>
                          <button
                            onClick={() => onOpenStage(order, it, s)}
                            className={"w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-right text-xs " + cls}
                          >
                            <span className="flex items-center gap-1.5 font-semibold">
                              <Icon size={14} />
                              {actions.label(s)}
                            </span>
                            <span className="truncate opacity-90">
                              {done
                                ? `${done.by ?? "—"}، ${faDate(localDate(done.at))}`
                                : delay
                                  ? `${DELAY_REASONS[delay.reason]}${delay.eta ? `، تا ${faDate(delay.eta)}` : ""}`
                                  : label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          {/* timeline */}
          <section>
            <h3 className="text-sm font-bold mb-3">تاریخچه‌ی سفارش</h3>
            {error && <div className="text-xs text-[#991B1B]">{error}</div>}
            {!events && !error && <div className="text-xs text-[#8A7B60]">در حال بارگذاری…</div>}
            {events && events.length === 0 && <div className="text-xs text-[#8A7B60]">هنوز رویدادی ثبت نشده</div>}
            {events && (
              <ol className="relative border-r-2 border-[#E4DCC8] pr-4 flex flex-col gap-3">
                {events.map((e) => {
                  const bad = e.kind === "delay_reported";
                  return (
                    <li key={e.id} className="relative">
                      <span
                        className={"absolute -right-[23px] top-1 h-3 w-3 rounded-full border-2 border-[#FBF8F1] " + (bad ? "bg-[#DC2626]" : e.kind === "stage_done" || e.kind === "delivered" ? "bg-[#16A34A]" : "bg-[#9C7A3C]")}
                      />
                      <div className="text-sm">
                        <span className="font-medium">{e.user ?? "—"}</span> {EVENT_LABELS[e.kind] ?? e.kind}
                        {e.stage && <span className="font-medium">، {actions.label(e.stage)}</span>}
                        {e.itemName && <span className="text-[#6B5E4F]">، {e.itemName}</span>}
                      </div>
                      {bad && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-[#991B1B]">
                          <AlertTriangle size={12} />
                          {delayReasonText(e.details)}
                          {typeof e.details.eta === "string" && `، تخمین ${faDate(e.details.eta)}`}
                        </div>
                      )}
                      <div className="text-[11px] text-[#8A7B60]">
                        {faDate(localDate(e.at))} — {faTime(e.at)}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
