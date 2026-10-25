"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { faDateFull, faNum, faTime } from "@/lib/format";
import { STAGES, type Order, type Station } from "@/lib/types";

// A4 order sheet for the workshop. Never shows prices.
export default function PrintSheet() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<{ order: Order; stations: Station[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<{ order: Order; stations: Station[] }>("GET", `/api/print/${encodeURIComponent(code)}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e?.status === 401 ? "اول از صفحه‌ی اصلی وارد شو" : errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) return <div className="p-10 text-center text-sm text-[#8A3C2F]">{error}</div>;
  if (!data) return <div className="p-10 text-center text-sm text-[#6B5E4F]">در حال بارگذاری…</div>;

  const { order, stations } = data;
  const label = (k: string) => stations.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="min-h-screen bg-[#EDE6D6] print:bg-white py-6 print:py-0">
      <div className="mx-auto max-w-[210mm] bg-white p-8 print:p-0 shadow print:shadow-none text-[#111]">
        <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
          <div>
            <div className="text-2xl font-bold">برگه‌ی کارگاه — {order.code}</div>
            <div className="text-sm mt-1">مشتری: {order.customer}</div>
          </div>
          <div className="text-sm text-left leading-7">
            <div>تاریخ سفارش: {faDateFull(order.orderDate)} — {faTime(order.registeredAt)}</div>
            <div className="font-bold">تحویل: {faDateFull(order.requested)}</div>
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#eee]">
              <th className="border border-black p-2 w-8">#</th>
              <th className="border border-black p-2 text-right">مدل</th>
              <th className="border border-black p-2 w-12">تعداد</th>
              <th className="border border-black p-2 text-right">پارچه</th>
              <th className="border border-black p-2 text-right">چوب</th>
              {STAGES.map((s) => (
                <th key={s} className="border border-black p-1 text-[11px] w-14">{label(s)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={it.id}>
                <td className="border border-black p-2 text-center">{faNum(i + 1)}</td>
                <td className="border border-black p-2">{it.productName}</td>
                <td className="border border-black p-2 text-center">{faNum(it.qty)}</td>
                <td className="border border-black p-2">{it.fabricColor || "—"}</td>
                <td className="border border-black p-2">{it.woodColor || "—"}</td>
                {STAGES.map((s) => (
                  <td key={s} className="border border-black p-1 text-center text-lg">{it.production[s] ? "✓" : "☐"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {order.notes && (
          <div className="mt-4 border border-black p-3 text-sm">
            <div className="font-bold mb-1">توضیحات</div>
            <div className="whitespace-pre-wrap">{order.notes}</div>
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <div className="border-t border-black pt-2">امضای سرپرست کارگاه</div>
          <div className="border-t border-black pt-2">امضای تحویل‌گیرنده</div>
        </div>
      </div>

      <div className="mt-4 flex justify-center print:hidden">
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-[#3B241A] text-white px-5 py-2.5 text-sm">
          <Printer size={16} />
          چاپ
        </button>
      </div>
    </div>
  );
}
