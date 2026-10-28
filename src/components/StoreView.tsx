"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownUp, ArrowUpLeft, Pencil, Printer, Search, Trash2 } from "lucide-react";
import OrderForm, { type OrderPayload } from "./OrderForm";
import { useToast } from "./Toast";
import { Empty, Modal, PageTitle, cardCls, linkBtn } from "./ui";
import { api, errorMessage, printUrl } from "@/lib/api";
import { daysBetween, todayISO } from "@/lib/dates";
import { faDate, faNum, faPrice, faTime } from "@/lib/format";
import {
  LEDGER_FILTERS,
  LEDGER_SORTS,
  currentStationText,
  isDelivered,
  itemColors,
  matchesLedgerFilter,
  orderProgress,
  orderTotals,
  sortLedger,
  statusOf,
  toneColor,
  type LedgerFilter,
  type LedgerSort,
} from "@/lib/production";
import { DELAY_REASONS, type Bootstrap, type Order } from "@/lib/types";

const SORT_KEY = "mizan:ledger-sort";

// Remembered per viewer; falls back to "fewest days left".
function savedSort(): { key: LedgerSort; reverse: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY) ?? "null");
    if (v && v.key in LEDGER_SORTS) return { key: v.key, reverse: !!v.reverse };
  } catch {
    // ignore
  }
  return { key: "remaining", reverse: false };
}

type Props = {
  data: Bootstrap;
  refresh: () => Promise<void>;
  highlightId: number | null;
  onJump: (orderId: number) => void;
  onFlash: (orderId: number) => void;
};

export default function StoreView({ data, refresh, highlightId, onJump, onFlash }: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<Order | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const today = todayISO();

  const [sort, setSortState] = useState(savedSort);
  const [filter, setFilter] = useState<LedgerFilter>("all");

  const setSort = (next: { key: LedgerSort; reverse: boolean }) => {
    setSortState(next);
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(next));
    } catch {
      // per-viewer convenience only
    }
  };

  const open = useMemo(() => {
    const q = query.trim();
    return data.orders
      .filter((o) => !isDelivered(o))
      .filter((o) => !q || o.customer.includes(q) || o.code.toLowerCase().includes(q.toLowerCase()) || o.items.some((it) => it.productName.includes(q)));
  }, [data.orders, query]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(LEDGER_FILTERS) as LedgerFilter[]).map((f) => [f, open.filter((o) => matchesLedgerFilter(o, f, today)).length])
      ) as Record<LedgerFilter, number>,
    [open, today]
  );

  const ledger = useMemo(
    () => sortLedger(open.filter((o) => matchesLedgerFilter(o, filter, today)), sort.key, sort.reverse),
    [open, filter, sort, today]
  );

  const create = async (payload: OrderPayload, ready: boolean) => {
    try {
      const { order } = await api<{ order: Order }>("POST", "/api/orders", { ...payload, ready });
      await refresh();
      onFlash(order.id);
      toast.ok(
        ready
          ? `سفارش ${order.code} به‌عنوان آماده ثبت شد و توی «تحویل نهایی» کارگاه منتظره`
          : `سفارش ${order.code} ثبت شد و به کارگاه ارسال شد`
      );
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  const save = async (payload: OrderPayload) => {
    if (!editing) return false;
    try {
      await api("PATCH", `/api/orders/${editing.id}`, { ...payload, version: editing.version });
      await refresh();
      onFlash(editing.id);
      toast.ok(`سفارش ${editing.code} ویرایش شد`);
      setEditing(null);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      if (e instanceof Error && "status" in e && e.status === 409) await refresh();
      return false;
    }
  };

  const remove = async (o: Order) => {
    if (confirmDeleteId !== o.id) {
      setConfirmDeleteId(o.id);
      window.setTimeout(() => setConfirmDeleteId((id) => (id === o.id ? null : id)), 3000);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await api("DELETE", `/api/orders/${o.id}`);
      await refresh();
      toast.ok(`سفارش ${o.code} حذف شد`, {
        label: "برگردون",
        run: async () => {
          try {
            await api("POST", `/api/orders/${o.id}/restore`);
            await refresh();
            toast.ok(`سفارش ${o.code} برگشت`);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className={cardCls + " p-5 shadow-sm"}>
        <h2 className="text-sm font-bold mb-3">ثبت سفارش جدید</h2>
        <OrderForm
          products={data.products}
          categories={data.categories}
          customers={data.customers}
          onSubmit={create}
          onError={toast.error}
        />
      </section>

      <section>
        <PageTitle title="سفارش‌های در جریان" subtitle="سفارش‌های تحویل‌شده توی «تاریخچه» هستن — قیمت فقط برای فروشگاه و مدیر نشون داده می‌شه" />
        <div className="mb-2 flex flex-col sm:flex-row gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
            <Search size={15} className="text-[#8A7B60]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجوی مشتری، شماره سفارش یا مدل"
              className="flex-1 min-w-0 bg-transparent text-sm outline-none"
            />
          </label>
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2 text-xs text-[#6B5E4F]">
              مرتب‌سازی
              <select
                value={sort.key}
                onChange={(e) => setSort({ key: e.target.value as LedgerSort, reverse: false })}
                className="bg-transparent text-sm text-[#2B2420] outline-none"
              >
                {(Object.keys(LEDGER_SORTS) as LedgerSort[]).map((k) => (
                  <option key={k} value={k}>{LEDGER_SORTS[k]}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setSort({ ...sort, reverse: !sort.reverse })}
              aria-pressed={sort.reverse}
              title="برعکس کردن ترتیب"
              aria-label="برعکس کردن ترتیب"
              className={
                "rounded-lg border px-2.5 py-2 " +
                (sort.reverse ? "border-[#9C7A3C] bg-[#F0E4C8] text-[#3B241A]" : "border-[#D9CDB6] bg-[#F7F2E7] text-[#6B5E4F]")
              }
            >
              <ArrowDownUp size={16} />
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(Object.keys(LEDGER_FILTERS) as LedgerFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs " +
                (filter === f ? "bg-[#3B241A] border-[#3B241A] text-[#F3EEE1]" : "bg-[#FBF8F1] border-[#D9CDB6] text-[#4A2E22]")
              }
            >
              {LEDGER_FILTERS[f]}
              <span
                className={
                  "rounded-full px-1.5 text-[10px] " +
                  (filter === f ? "bg-white/20" : f === "late" && counts.late ? "bg-[#DC2626] text-white" : "bg-[#EDE6D6]")
                }
              >
                {faNum(counts[f])}
              </span>
            </button>
          ))}
        </div>

        <div className={cardCls + " overflow-hidden"}>
          {ledger.length === 0 && <Empty>{open.length ? "سفارشی با این فیلتر نیست" : "سفارشی در جریان نیست"}</Empty>}
          {ledger.map((o) => {
            const st = statusOf(o, today);
            const totals = orderTotals(o);
            const colors = o.items.filter((it) => it.fabricColor || it.woodColor);
            const progress = orderProgress(o);
            const doneStages = Math.round(progress * o.items.length * 5);
            const delays = o.items.flatMap((it) => it.delays);
            const age = daysBetween(o.orderDate, today);
            return (
              <div
                key={o.id}
                style={{ borderRightWidth: "5px", borderRightColor: toneColor[st.tone], borderRightStyle: "solid" }}
                className={
                  "px-4 py-3 border-b border-[#E4DCC8] last:border-0 transition-colors " +
                  (highlightId === o.id ? "bg-[#F0E4C8]" : "")
                }
              >
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium">{o.customer}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-[11px] text-[#6B5E4F]" title={`${faNum(doneStages)} از ${faNum(o.items.length * 5)} مرحله‌ی تولید`}>
                      <span className="h-1.5 w-16 rounded-full bg-[#E4DCC8] overflow-hidden">
                        <span className="block h-full bg-[#16A34A]" style={{ width: `${progress * 100}%` }} />
                      </span>
                      {faNum(doneStages)}/{faNum(o.items.length * 5)}
                    </span>
                    <span style={{ backgroundColor: toneColor[st.tone] }} className="text-xs px-2 py-1 rounded-full font-medium text-white whitespace-nowrap">
                      {st.text}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-[#6B5E4F] mb-1">
                  {o.code} — {totals.summary}
                </div>
                <div className="text-xs text-[#6B5E4F] mb-2">
                  {faPrice(totals.price)} تومان
                  {colors.length > 0 && <span> · {colors.map((it) => `${it.productName}: ${itemColors(it)}`).join("، ")}</span>}
                </div>
                {o.notes && <div className="text-xs text-[#8A7B60] mb-2">{o.notes}</div>}
                {delays.length > 0 && (
                  <div className="mb-2 flex items-center gap-1 text-xs text-[#991B1B]">
                    <AlertTriangle size={13} className="shrink-0" />
                    تأخیر تولید: {delays.map((d) => DELAY_REASONS[d.reason]).join("، ")}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-[#6B5E4F]">
                    <span>
                      ثبت سفارش: {faDate(o.orderDate)} — ساعت {faTime(o.registeredAt)}
                      {age > 0 && <span className="text-[#8A7B60]"> ({faNum(age)} روز پیش)</span>}
                    </span>
                    <span>تحویل: {faDate(o.requested)}</span>
                    <span className="text-[#8A7B60]">{currentStationText(o, data.stations)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setEditing(o)} className={linkBtn}>
                      <Pencil size={13} />
                      ویرایش
                    </button>
                    <a href={printUrl(o.code)} target="_blank" rel="noreferrer" className={linkBtn}>
                      <Printer size={13} />
                      چاپ
                    </a>
                    <button onClick={() => onJump(o.id)} className={linkBtn}>
                      کارگاه
                      <ArrowUpLeft size={13} />
                    </button>
                    <button
                      onClick={() => remove(o)}
                      title={confirmDeleteId === o.id ? "برای حذف قطعی دوباره بزن" : "حذف سفارش"}
                      className={
                        "flex items-center gap-1 transition-colors " +
                        (confirmDeleteId === o.id ? "text-[#8A3C2F] font-semibold" : "text-[#8A7B60] hover:text-[#8A3C2F]")
                      }
                    >
                      <Trash2 size={14} />
                      {confirmDeleteId === o.id && <span className="text-[10px]">دوباره بزن</span>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {editing && (
        <Modal title={`ویرایش سفارش ${editing.code}`} onClose={() => setEditing(null)} wide>
          <OrderForm
            products={data.products}
            categories={data.categories}
            customers={data.customers}
            initial={editing}
            onSubmit={save}
            onError={toast.error}
          />
        </Modal>
      )}
    </div>
  );
}
