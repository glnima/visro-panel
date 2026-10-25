"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { useToast } from "./Toast";
import { Empty, PageTitle, cardCls } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { faDate, faTime } from "@/lib/format";
import type { Bootstrap, OrderEvent, StationKey } from "@/lib/types";

const KIND_LABELS: Record<string, string> = {
  created: "سفارش ثبت کرد",
  edited: "سفارش رو ویرایش کرد",
  deleted: "سفارش رو حذف کرد",
  restored: "سفارش رو برگردوند",
  stage_done: "مرحله رو تمام کرد",
  stage_undone: "مرحله رو برگردوند",
  delivered: "تحویل داد",
  undelivered: "تحویل رو برگردوند",
  product_added: "محصول اضافه کرد",
  product_edited: "محصول رو ویرایش کرد",
  product_deleted: "محصول رو حذف کرد",
  product_restored: "محصول رو برگردوند",
  user_added: "کاربر ساخت",
  user_edited: "کاربر رو ویرایش کرد",
};

export default function AuditView({ data }: { data: Bootstrap }) {
  const toast = useToast();
  const [events, setEvents] = useState<OrderEvent[] | null>(null);
  const label = (k: StationKey) => data.stations.find((s) => s.key === k)?.label ?? k;

  useEffect(() => {
    let cancelled = false;
    api<{ events: OrderEvent[] }>("GET", "/api/audit?limit=300")
      .then((r) => !cancelled && setEvents(r.events))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [toast, data.version]);

  return (
    <div>
      <PageTitle icon={<ScrollText size={18} />} title="رویدادها" subtitle="چه کسی، چه کاری، کِی — ۳۰۰ رویداد آخر" />
      <div className={cardCls + " overflow-hidden"}>
        {events === null && <Empty>در حال بارگذاری…</Empty>}
        {events?.length === 0 && <Empty>هنوز رویدادی ثبت نشده</Empty>}
        {events?.map((e) => {
          const day = e.at.slice(0, 10);
          const what = [
            e.orderCode,
            e.itemName,
            e.stage && label(e.stage),
            typeof e.details.name === "string" ? e.details.name : null,
            typeof e.details.username === "string" ? e.details.username : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={e.id} className="px-4 py-2.5 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap text-sm">
              <span>
                <span className="font-medium">{e.user ?? "—"}</span> {KIND_LABELS[e.kind] ?? e.kind}
                {what && <span className="text-xs text-[#6B5E4F]"> — {what}</span>}
              </span>
              <span className="text-xs text-[#8A7B60]">
                {faDate(day)} — {faTime(e.at)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
