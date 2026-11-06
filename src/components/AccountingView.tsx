"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Download, Search, Wallet } from "lucide-react";
import JalaliDateInput from "./JalaliDateInput";
import PaymentsDialog, { PayBadge } from "./PaymentsDialog";
import { useToast } from "./Toast";
import { Empty, PageTitle, cardCls, linkBtn, secondaryBtn } from "./ui";
import { ledgerCounts, ledgerCsv, ledgerTotals, orderBalance, orderPaid } from "@/lib/accounting";
import { api, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { faDate, faDateFull, faNum, faPrice } from "@/lib/format";
import { isoToJalali, jalaliToIso } from "@/lib/jalali";
import { isDelivered, orderTotals } from "@/lib/production";
import { PAYMENT_METHODS, canSeeLedger, type Bootstrap, type LedgerEntry, type Order } from "@/lib/types";

type Filter = "due" | "deliveredDue" | "settled" | "all";

const FILTERS: Record<Filter, string> = {
  due: "مانده‌دار",
  deliveredDue: "تحویل‌شده با مانده",
  settled: "تسویه‌شده",
  all: "همه",
};

const matches = (o: Order, f: Filter) =>
  f === "all" ||
  (f === "due" && orderBalance(o) > 0) ||
  (f === "deliveredDue" && orderBalance(o) > 0 && isDelivered(o)) ||
  (f === "settled" && orderBalance(o) <= 0);

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={cardCls + " p-4"}>
      <div className="text-xs text-[#6B5E4F]">{label}</div>
      <div className="text-xl font-bold mt-1 text-[#2B2420] tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-[#8A7B60] mt-1">{note}</div>}
    </div>
  );
}

// Who owes what: every order's total, what came in, what's left.
export default function AccountingView({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<Filter>("due");
  const [query, setQuery] = useState("");
  const [byCustomer, setByCustomer] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const paying = data.orders.find((o) => o.id === payingId);

  const today = todayISO();
  const [jy, jm] = isoToJalali(today);
  const monthStart = jalaliToIso(jy, jm, 1);

  const totals = useMemo(() => {
    const due = data.orders.filter((o) => orderBalance(o) > 0);
    const received = data.orders.flatMap((o) => o.payments).filter((p) => p.paidOn >= monthStart);
    return {
      outstanding: due.reduce((s, o) => s + orderBalance(o), 0),
      dueCount: due.length,
      deliveredDue: due.filter(isDelivered).reduce((s, o) => s + orderBalance(o), 0),
      received: received.reduce((s, p) => s + p.amount, 0),
      receivedCount: received.length,
      sold: data.orders.filter((o) => o.orderDate >= monthStart).reduce((s, o) => s + orderTotals(o).price, 0),
    };
  }, [data.orders, monthStart]);

  const q = query.trim();
  const list = data.orders
    .filter((o) => matches(o, filter))
    .filter((o) => !q || o.customer.includes(q) || o.code.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => orderBalance(b) - orderBalance(a) || b.orderDate.localeCompare(a.orderDate));

  const customers = useMemo(() => {
    const m = new Map<number, { name: string; total: number; paid: number; count: number }>();
    for (const o of list) {
      const c = m.get(o.customerId) ?? { name: o.customer, total: 0, paid: 0, count: 0 };
      c.total += orderTotals(o).price;
      c.paid += orderPaid(o);
      c.count++;
      m.set(o.customerId, c);
    }
    return [...m.entries()].sort(([, a], [, b]) => b.total - b.paid - (a.total - a.paid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.orders, filter, q]);

  const recent = data.orders
    .flatMap((o) => o.payments.map((p) => ({ ...p, order: o })))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id - a.id)
    .slice(0, 15);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle icon={<Calculator size={18} />} title="حسابداری" subtitle="مانده‌ی هر سفارش و هر مشتری، و پرداخت‌های دریافت‌شده (مبالغ به تومان)" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="کل مانده‌ی طلب" value={faPrice(totals.outstanding)} note={`${faNum(totals.dueCount)} سفارش`} />
        <Tile label="تحویل‌شده ولی تسویه‌نشده" value={faPrice(totals.deliveredDue)} note="جنس رفته، پول کامل نیومده" />
        <Tile label="دریافتی این ماه" value={faPrice(totals.received)} note={`${faNum(totals.receivedCount)} پرداخت`} />
        <Tile label="فروش این ماه" value={faPrice(totals.sold)} note="مبلغ سفارش‌های ثبت‌شده" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#D9CDB6] bg-[#F7F2E7] px-3 py-2">
          <Search size={15} className="text-[#8A7B60]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی مشتری یا شماره سفارش" className="flex-1 min-w-0 bg-transparent text-sm outline-none" />
        </label>
        <div className="flex w-max rounded-lg bg-[#E4DCC8] p-1 gap-0.5">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              onClick={() => setByCustomer(v)}
              aria-pressed={byCustomer === v}
              className={"rounded-md px-3 py-1.5 text-sm " + (byCustomer === v ? "bg-[#FBF8F1] font-semibold shadow-sm" : "text-[#6B5E4F]")}
            >
              {v ? "به تفکیک مشتری" : "به تفکیک سفارش"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={"rounded-full border px-3 py-1 text-xs " + (filter === f ? "bg-[#3B241A] border-[#3B241A] text-[#F3EEE1]" : "bg-[#FBF8F1] border-[#D9CDB6] text-[#4A2E22]")}
          >
            {FILTERS[f]}
          </button>
        ))}
      </div>

      <div className={cardCls + " overflow-hidden"}>
        {list.length === 0 && <Empty>چیزی با این فیلتر نیست</Empty>}
        {!byCustomer &&
          list.map((o) => {
            const total = orderTotals(o).price;
            const paid = orderPaid(o);
            const balance = orderBalance(o);
            return (
              <div key={o.id} className="px-4 py-3 border-b border-[#E4DCC8] last:border-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {o.customer} <span className="text-xs font-normal text-[#8A7B60]">{o.code}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <PayBadge order={o} />
                    <button onClick={() => setPayingId(o.id)} className={linkBtn}>
                      <Wallet size={13} />
                      پرداخت
                    </button>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[#E4DCC8] overflow-hidden">
                  <div className="h-full bg-[#16A34A]" style={{ width: `${total ? Math.min(100, (paid / total) * 100) : 0}%` }} />
                </div>
                <div className="mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-[#6B5E4F]">
                  <span>مبلغ: {faPrice(total)}</span>
                  <span>پرداخت‌شده: {faPrice(paid)}</span>
                  <b className="text-[#2B2420]">{balance < 0 ? "بستانکار" : "مانده"}: {faPrice(Math.abs(balance))}</b>
                  <span className="text-[#8A7B60]">
                    سفارش {faDate(o.orderDate)}
                    {isDelivered(o) ? "، تحویل شده" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        {byCustomer &&
          customers.map(([id, c]) => (
            <div key={id} className="px-4 py-3 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-medium">
                {c.name} <span className="text-xs font-normal text-[#8A7B60]">({faNum(c.count)} سفارش)</span>
              </span>
              <span className="flex items-center gap-4 flex-wrap text-xs text-[#6B5E4F]">
                <span>مبلغ: {faPrice(c.total)}</span>
                <span>پرداخت‌شده: {faPrice(c.paid)}</span>
                <b className="text-[#2B2420]">مانده: {faPrice(c.total - c.paid)}</b>
              </span>
            </div>
          ))}
      </div>

      {canSeeLedger(data.me.role) ? (
        <PaymentsLedger version={data.version} monthStart={monthStart} today={today} />
      ) : (
        <section>
          <h2 className="text-sm font-bold mb-2">آخرین پرداخت‌ها</h2>
          <div className={cardCls + " overflow-hidden"}>
            {recent.length === 0 && <Empty>هنوز پرداختی ثبت نشده</Empty>}
            {recent.map((p) => (
              <button
                key={p.id}
                onClick={() => setPayingId(p.order.id)}
                className="w-full text-right px-4 py-2.5 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap text-xs hover:bg-[#F0E4C8]"
              >
                <span>
                  <b className="text-sm">{faPrice(p.amount)}</b> — {PAYMENT_METHODS[p.method]}، {p.order.customer} ({p.order.code})
                </span>
                <span className="text-[#8A7B60]">{faDateFull(p.paidOn)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {paying && <PaymentsDialog order={paying} refresh={refresh} onClose={() => setPayingId(null)} />}
    </div>
  );
}

// Accountant and admin: every payment in a period, voided ones included, with an Excel export.
function PaymentsLedger({ version, monthStart, today }: { version: number; monthStart: string; today: string }) {
  const toast = useToast();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ entries: LedgerEntry[] }>("GET", `/api/payments?from=${from}&to=${to}`)
      .then((r) => !cancelled && setEntries(r.entries))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [from, to, version, toast]);

  const totals = entries ? ledgerTotals(entries) : null;

  const download = () => {
    if (!entries) return;
    const url = URL.createObjectURL(new Blob([ledgerCsv(entries, faDateFull)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <h2 className="text-sm font-bold mb-2">دفتر پرداخت‌ها</h2>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          از
          <JalaliDateInput value={from} onChange={setFrom} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B5E4F]">
          تا
          <JalaliDateInput value={to} onChange={setTo} min={from} />
        </label>
        <button onClick={download} disabled={!entries?.length} className={secondaryBtn}>
          <Download size={14} />
          خروجی اکسل
        </button>
      </div>
      {totals && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B5E4F]">
          <b className="text-sm text-[#2B2420]">جمع معتبر: {faPrice(totals.total)} تومان</b>
          {totals.byMethod.map((m) => (
            <span key={m.method}>
              {PAYMENT_METHODS[m.method]}: {faPrice(m.amount)}
            </span>
          ))}
        </div>
      )}
      <div className={cardCls + " overflow-hidden"}>
        {entries === null && <Empty>در حال بارگذاری…</Empty>}
        {entries?.length === 0 && <Empty>توی این بازه پرداختی نیست</Empty>}
        {entries?.map((e) => (
          <div
            key={e.id}
            className={"px-4 py-2.5 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap text-xs " + (ledgerCounts(e) ? "" : "opacity-60")}
          >
            <span>
              <b className={"text-sm " + (e.voidedAt ? "line-through" : "")}>{faPrice(e.amount)}</b> — {PAYMENT_METHODS[e.method]}، {e.customer} ({e.orderCode})
              {e.note && ` — ${e.note}`}
              <span className="block text-[#8A7B60] mt-0.5">
                {faDateFull(e.paidOn)}
                {e.by && `، ثبت: ${e.by}`}
              </span>
            </span>
            {e.voidedAt && <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[#991B1B]">باطل{e.voidedBy ? ` توسط ${e.voidedBy}` : ""}</span>}
            {!e.voidedAt && e.orderDeleted && <span className="rounded-full bg-[#F5F1E8] px-2 py-0.5 text-[#8A7B60]">سفارش حذف شده</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
