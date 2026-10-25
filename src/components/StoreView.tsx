"use client";

import { useState, type FormEvent, type MouseEvent } from "react";
import { AlertTriangle, ArrowUpLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import JalaliDateInput from "./JalaliDateInput";
import { daysAgo, daysFromNow, faDate, faNum, faPrice, faTime } from "@/lib/format";
import { currentStationText, orderTotals, statusOf, toneColor } from "@/lib/production";
import type { Order, OrderItem, Product } from "@/lib/types";

export type OrderDraft = {
  customer: string;
  orderDate: string;
  requested: string;
  notes: string;
  items: OrderItem[];
};

type Props = {
  products: Product[];
  ledger: Order[];
  highlightId: string | null;
  confirmDeleteId: string | null;
  toast: string;
  errorMsg: string;
  onCreateOrder: (draft: OrderDraft, ready: boolean) => boolean;
  onDelete: (id: string) => void;
  onJump: (id: string) => void;
  showError: (msg: string) => void;
};

const emptyForm = () => ({
  customer: "",
  orderDate: daysAgo(0),
  requested: daysFromNow(14),
  notes: "",
});

const inputCls =
  "rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]";

export default function StoreView({
  products,
  ledger,
  highlightId,
  confirmDeleteId,
  toast,
  errorMsg,
  onCreateOrder,
  onDelete,
  onJump,
  showError,
}: Props) {
  const [form, setForm] = useState(emptyForm);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [pickProductId, setPickProductId] = useState("");
  const [pickQty, setPickQty] = useState<number | string>(1);
  const [pickFabricColor, setPickFabricColor] = useState("");
  const [pickWoodColor, setPickWoodColor] = useState("");

  // default the item picker to the first product
  const selectedProductId = pickProductId || products[0]?.id || "";

  const addCartItem = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      showError("یه مدل از لیست انتخاب کن");
      return;
    }
    const qty = Number(pickQty) > 0 ? Number(pickQty) : 1;
    const fabricColor = pickFabricColor.trim();
    const woodColor = pickWoodColor.trim();
    setCartItems((prev) => {
      const idx = prev.findIndex(
        (it) => it.productId === product.id && it.fabricColor === fabricColor && it.woodColor === woodColor
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      }
      return [
        ...prev,
        { productId: product.id, productName: product.name, unitPrice: product.price, qty, fabricColor, woodColor },
      ];
    });
    setPickQty(1);
    setPickFabricColor("");
    setPickWoodColor("");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const removeCartItem = (productId: string, fabricColor: string, woodColor: string) => {
    setCartItems((prev) =>
      prev.filter(
        (it) => !(it.productId === productId && it.fabricColor === fabricColor && it.woodColor === woodColor)
      )
    );
  };

  const submit = (e: FormEvent | MouseEvent, ready = false) => {
    e.preventDefault();
    const ok = onCreateOrder({ ...form, items: cartItems }, ready);
    if (ok) {
      setForm(emptyForm());
      setCartItems([]);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* New order form */}
      <section>
        <div className="rounded-xl border border-[#D9CDB6] bg-[#F7F2E7] p-5 shadow-sm">
          <h2 className="text-sm font-bold mb-3">ثبت سفارش جدید</h2>

          <form onSubmit={(e) => submit(e)} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                نام مشتری
                <input
                  value={form.customer}
                  onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))}
                  placeholder="مثلاً بوتیک مبلمان الوند"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                تاریخ سفارش
                <JalaliDateInput
                  value={form.orderDate}
                  onChange={(iso) => setForm((f) => ({ ...f, orderDate: iso }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                تاریخ تحویل
                <JalaliDateInput
                  value={form.requested}
                  onChange={(iso) => setForm((f) => ({ ...f, requested: iso }))}
                />
              </label>

              <div className="rounded-lg bg-[#EDE6D6] p-3.5">
                <div className="text-xs text-[#6B5E4F] mb-2">افزودن مدل به این سفارش</div>
                <div className="flex flex-col gap-3">
                  <label className="flex-1 flex flex-col gap-1 text-xs text-[#6B5E4F]">
                    مدل
                    <select
                      value={selectedProductId}
                      onChange={(e) => setPickProductId(e.target.value)}
                      className={inputCls}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                    تعداد
                    <input
                      type="number"
                      min={1}
                      value={pickQty}
                      onChange={(e) => setPickQty(e.target.value)}
                      className={inputCls + " w-24"}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                    رنگ پارچه (برای همین مدل)
                    <input
                      value={pickFabricColor}
                      onChange={(e) => setPickFabricColor(e.target.value)}
                      placeholder="مثلاً مخمل زرشکی"
                      className={inputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                    رنگ / نوع چوب (برای همین مدل)
                    <input
                      value={pickWoodColor}
                      onChange={(e) => setPickWoodColor(e.target.value)}
                      placeholder="مثلاً راش تیره"
                      className={inputCls}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addCartItem}
                    className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-[#9C7A3C] text-white text-sm font-medium py-2.5 px-5"
                  >
                    <Plus size={15} />
                    افزودن به سفارش
                  </button>
                </div>

                {cartItems.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {cartItems.map((it, idx) => (
                      <div
                        key={it.productId + "-" + idx}
                        className="flex items-center justify-between bg-[#F7F2E7] rounded-lg px-3 py-2 text-sm"
                      >
                        <div>
                          <div>{it.productName} × {faNum(it.qty)}</div>
                          {(it.fabricColor || it.woodColor) && (
                            <div className="text-xs text-[#8A7B60] mt-0.5">
                              {[it.fabricColor && `پارچه: ${it.fabricColor}`, it.woodColor && `چوب: ${it.woodColor}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#6B5E4F]">{faPrice(it.unitPrice * it.qty)} تومان</span>
                          <button
                            type="button"
                            onClick={() => removeCartItem(it.productId, it.fabricColor, it.woodColor)}
                            className="text-[#8A7B60] hover:text-[#8A3C2F]"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
                توضیحات بیشتر
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className={inputCls + " resize-none"}
                />
              </label>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="submit"
                className="self-start flex items-center justify-center gap-1.5 rounded-lg bg-[#3B241A] text-[#F3EEE1] text-sm font-medium py-2.5 px-6 hover:bg-[#4A2E22] transition-colors"
              >
                <Plus size={15} />
                ثبت سفارش
              </button>
              <button
                type="button"
                onClick={(e) => submit(e, true)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] text-white text-sm font-medium py-2.5 px-5"
                title="برای اجناس آماده‌ی نمایشگاه — مراحل تولید رو رد می‌کنه و می‌ره توی «تحویل نهایی» کارگاه"
              >
                <CheckCircle2 size={15} />
                ثبت سفارش آماده
              </button>
              {toast && (
                <span className="text-sm text-[#16A34A] font-medium flex items-center gap-1">
                  <CheckCircle2 size={15} />
                  {toast}
                </span>
              )}
              {errorMsg && (
                <span className="text-sm text-[#DC2626] font-medium flex items-center gap-1">
                  <AlertTriangle size={15} />
                  {errorMsg}
                </span>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Ledger */}
      <section>
        <h1 className="text-lg font-bold mb-1">سفارش‌های فروشگاه</h1>
        <p className="text-sm text-[#6B5E4F] mb-4">جدیدترین سفارش بالای لیست — قیمت فقط اینجا نشون داده می‌شه</p>

        <div className="rounded-xl border border-[#D9CDB6] overflow-hidden bg-[#F7F2E7]">
          {ledger.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-[#8A7B60]">هنوز سفارشی ثبت نشده</div>
          )}
          {ledger.map((o) => {
            const st = statusOf(o);
            const totals = orderTotals(o);
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
                  <span
                    style={{ backgroundColor: toneColor[st.tone] }}
                    className="text-xs px-2 py-1 rounded-full font-medium text-white"
                  >
                    {st.text}
                  </span>
                </div>
                <div className="text-xs text-[#6B5E4F] mb-1">
                  {o.id} — {totals.summary}
                </div>
                <div className="text-xs text-[#6B5E4F] mb-2">
                  {faPrice(totals.price)} تومان
                  {o.items.some((it) => it.fabricColor || it.woodColor) && (
                    <span>
                      {" · "}
                      {o.items
                        .filter((it) => it.fabricColor || it.woodColor)
                        .map((it) => `${it.productName}: ${[it.fabricColor, it.woodColor].filter(Boolean).join(" / ")}`)
                        .join("، ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-4 text-xs text-[#6B5E4F]">
                    <span>
                      ثبت سفارش: {faDate(o.createdAt)}
                      {o.registeredAt && ` — ساعت ${faTime(o.registeredAt)}`}
                    </span>
                    <span>تحویل: {faDate(o.requested)}</span>
                    <span className="text-[#8A7B60]">{currentStationText(o)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => onJump(o.id)}
                      className="text-xs text-[#7A5E28] hover:text-[#5C4620] flex items-center gap-1"
                    >
                      کارگاه
                      <ArrowUpLeft size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(o.id)}
                      title={confirmDeleteId === o.id ? "برای حذف قطعی دوباره بزن" : "حذف سفارش"}
                      className={
                        "flex items-center gap-1 transition-colors " +
                        (confirmDeleteId === o.id
                          ? "text-[#8A3C2F] font-semibold"
                          : "text-[#8A7B60] hover:text-[#8A3C2F]")
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
    </div>
  );
}
