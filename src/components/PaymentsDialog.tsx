"use client";

import { useState, type FormEvent } from "react";
import { Ban, Wallet } from "lucide-react";
import JalaliDateInput from "./JalaliDateInput";
import { useToast } from "./Toast";
import { Modal, inputCls, labelCls, linkBtn, primaryBtn } from "./ui";
import { orderBalance, orderPaid, payState, PAY_STATE_LABELS, type PayState } from "@/lib/accounting";
import { api, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { faDateFull, faPrice, parseDigits } from "@/lib/format";
import { orderTotals } from "@/lib/production";
import { PAYMENT_METHODS, type Order, type PaymentMethod } from "@/lib/types";

const STATE_CLS: Record<PayState, string> = {
  unpaid: "bg-[#FEE2E2] text-[#991B1B]",
  partial: "bg-[#FEF3C7] text-[#92400E]",
  settled: "bg-[#DCFCE7] text-[#166534]",
  over: "bg-[#DBEAFE] text-[#1E40AF]",
};

export function PayBadge({ order }: { order: Order }) {
  const state = payState(order);
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap " + STATE_CLS[state]}>{PAY_STATE_LABELS[state]}</span>;
}

export function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const n = parseDigits(value);
  return (
    <label className={labelCls}>
      {label}
      <input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder="۰" className={inputCls} />
      <span className="text-[11px] text-[#8A7B60] h-4">{value && (Number.isFinite(n) ? `${faPrice(n)} تومان` : "فقط عدد بنویس")}</span>
    </label>
  );
}

export function MethodSelect({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <label className={labelCls}>
      روش پرداخت
      <select value={value} onChange={(e) => onChange(e.target.value as PaymentMethod)} className={inputCls}>
        {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => (
          <option key={m} value={m}>{PAYMENT_METHODS[m]}</option>
        ))}
      </select>
    </label>
  );
}

type Props = { order: Order; refresh: () => Promise<void>; onClose: () => void };

// One order's account: what it costs, what came in, and adding the next payment.
export default function PaymentsDialog({ order, refresh, onClose }: Props) {
  const toast = useToast();
  const total = orderTotals(order).price;
  const balance = orderBalance(order);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseDigits(amount);
    if (!(n > 0)) return toast.error("مبلغ رو به عدد (تومان) وارد کن");
    setBusy(true);
    try {
      await api("POST", `/api/orders/${order.id}/payments`, { amount: n, method, paidOn, note: note.trim() });
      await refresh();
      toast.ok(`${faPrice(n)} تومان برای ${order.code} ثبت شد`);
      setAmount("");
      setNote("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setVoid = async (id: number, voided: boolean) => {
    try {
      await api("POST", `/api/payments/${id}/${voided ? "void" : "restore"}`);
      await refresh();
      toast.ok(voided ? "پرداخت باطل شد" : "پرداخت برگشت", voided ? { label: "واگرد", run: () => void setVoid(id, false) } : undefined);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal title={`حساب سفارش ${order.code} — ${order.customer}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["مبلغ سفارش", total],
            ["پرداخت‌شده", orderPaid(order)],
            [balance < 0 ? "بستانکار" : "مانده", Math.abs(balance)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-[#EDE6D6] px-2 py-2">
              <div className="text-[11px] text-[#6B5E4F]">{label}</div>
              <div className="text-sm font-bold mt-0.5">{faPrice(value)}</div>
            </div>
          ))}
        </div>

        {order.payments.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {order.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 flex-wrap rounded-lg border border-[#E4DCC8] px-3 py-2 text-xs">
                <span>
                  <b className="text-sm">{faPrice(p.amount)} تومان</b> — {PAYMENT_METHODS[p.method]}
                  <span className="block text-[#8A7B60] mt-0.5">
                    {faDateFull(p.paidOn)}
                    {p.by && `، ${p.by}`}
                    {p.note && ` — ${p.note}`}
                  </span>
                </span>
                <button onClick={() => setVoid(p.id, true)} className={linkBtn}>
                  <Ban size={13} />
                  باطل کردن
                </button>
              </li>
            ))}
          </ul>
        )}

        {balance > 0 ? (
          <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-[#D9CDB6] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">ثبت پرداخت جدید</span>
              <button type="button" onClick={() => setAmount(String(balance))} className={linkBtn}>
                کل مانده ({faPrice(balance)})
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MoneyInput label="مبلغ (تومان)" value={amount} onChange={setAmount} />
              <MethodSelect value={method} onChange={setMethod} />
              <label className={labelCls}>
                تاریخ پرداخت
                <JalaliDateInput value={paidOn} onChange={setPaidOn} />
              </label>
              <label className={labelCls}>
                توضیح (اختیاری)
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شماره‌ی چک" className={inputCls} />
              </label>
            </div>
            <button type="submit" disabled={busy} className={primaryBtn + " self-start"}>
              <Wallet size={15} />
              ثبت پرداخت
            </button>
          </form>
        ) : (
          <p className="text-xs text-[#166534]">{balance === 0 ? "این سفارش تسویه شده." : "مشتری بیشتر از مبلغ سفارش پرداخت کرده."}</p>
        )}
      </div>
    </Modal>
  );
}
