"use client";

import { useMemo, useState } from "react";
import { ArrowUpLeft, Pencil, Printer, Search, Trash2 } from "lucide-react";
import OrderForm, { type OrderPayload } from "./OrderForm";
import { useToast } from "./Toast";
import { Empty, Modal, PageTitle, cardCls, linkBtn } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { faDate, faPrice, faTime } from "@/lib/format";
import { compareLedger, currentStationText, isDelivered, itemColors, orderTotals, statusOf, toneColor } from "@/lib/production";
import type { Bootstrap, Order } from "@/lib/types";

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

  const ledger = useMemo(() => {
    const q = query.trim();
    return data.orders
      .filter((o) => !isDelivered(o))
      .filter((o) => !q || o.customer.includes(q) || o.code.toLowerCase().includes(q.toLowerCase()))
      .sort(compareLedger);
  }, [data.orders, query]);

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
        <label className="mb-3 flex items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
          <Search size={15} className="text-[#8A7B60]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی مشتری یا شماره سفارش"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        <div className={cardCls + " overflow-hidden"}>
          {ledger.length === 0 && <Empty>سفارشی در جریان نیست</Empty>}
          {ledger.map((o) => {
            const st = statusOf(o, today);
            const totals = orderTotals(o);
            const colors = o.items.filter((it) => it.fabricColor || it.woodColor);
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
                  <span style={{ backgroundColor: toneColor[st.tone] }} className="text-xs px-2 py-1 rounded-full font-medium text-white">
                    {st.text}
                  </span>
                </div>
                <div className="text-xs text-[#6B5E4F] mb-1">
                  {o.code} — {totals.summary}
                </div>
                <div className="text-xs text-[#6B5E4F] mb-2">
                  {faPrice(totals.price)} تومان
                  {colors.length > 0 && <span> · {colors.map((it) => `${it.productName}: ${itemColors(it)}`).join("، ")}</span>}
                </div>
                {o.notes && <div className="text-xs text-[#8A7B60] mb-2">{o.notes}</div>}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-[#6B5E4F]">
                    <span>
                      ثبت سفارش: {faDate(o.orderDate)} — ساعت {faTime(o.registeredAt)}
                    </span>
                    <span>تحویل: {faDate(o.requested)}</span>
                    <span className="text-[#8A7B60]">{currentStationText(o, data.stations)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setEditing(o)} className={linkBtn}>
                      <Pencil size={13} />
                      ویرایش
                    </button>
                    <a href={`/print/${o.code}`} target="_blank" rel="noreferrer" className={linkBtn}>
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
