"use client";

import { useCallback, useRef, useState } from "react";
import { LogOut, WifiOff } from "lucide-react";
import AuditView from "./AuditView";
import CustomersView from "./CustomersView";
import HistoryView from "./HistoryView";
import ProductsView from "./ProductsView";
import ReportsView from "./ReportsView";
import SettingsView from "./SettingsView";
import StoreView from "./StoreView";
import WorkshopView from "./WorkshopView";
import { ROLE_LABELS, type Role, type User } from "@/lib/types";
import { useMizanData } from "@/lib/useMizanData";

type View = "store" | "workshop" | "customers" | "history" | "reports" | "products" | "settings" | "audit";

const TABS: { key: View; label: string; roles: Role[] }[] = [
  { key: "store", label: "فروشگاه", roles: ["admin", "store"] },
  { key: "workshop", label: "کارگاه تولید", roles: ["admin", "store", "workshop"] },
  { key: "customers", label: "مشتری‌ها", roles: ["admin", "store"] },
  { key: "history", label: "تاریخچه", roles: ["admin", "store", "workshop"] },
  { key: "reports", label: "گزارش‌ها", roles: ["admin", "store"] },
  { key: "products", label: "محصولات", roles: ["admin"] },
  { key: "settings", label: "تنظیمات", roles: ["admin"] },
  { key: "audit", label: "رویدادها", roles: ["admin"] },
];

export default function MizanApp({ me, onLogout }: { me: User; onLogout: () => void }) {
  const tabs = TABS.filter((t) => t.roles.includes(me.role));
  const [view, setView] = useState<View>(tabs[0].key);
  const { data, offline, refresh } = useMizanData();
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((id: number) => {
    setHighlightId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setHighlightId(null), 2200);
  }, []);

  const jumpToOrder = (id: number) => {
    setView("workshop");
    flash(id);
  };

  return (
    <div className="min-h-screen w-full bg-[#EDE6D6] text-[#2B2420] pb-20">
      <header className="bg-[#3B241A] text-[#F3EEE1]">
        <div className="mx-auto max-w-6xl px-4 sm:px-5 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xl font-bold tracking-tight">میزان</div>
              <div className="text-xs text-[#C9B79E] mt-0.5">هماهنگی فروش و تولید مبل</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#D9CDB6]">
            <span>
              {me.displayName} · {ROLE_LABELS[me.role]}
            </span>
            <button onClick={onLogout} className="flex items-center gap-1 rounded-md border border-[#5C4033] px-2 py-1 hover:bg-[#4A2E22]">
              <LogOut size={13} />
              خروج
            </button>
          </div>
          {tabs.length > 1 && (
            <nav className="w-full -mx-1 overflow-x-auto">
              <div className="flex w-max rounded-lg bg-[#2C1B13] p-1 gap-0.5 mx-1">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setView(t.key)}
                    className={
                      "px-3.5 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors " +
                      (view === t.key ? "bg-[#9C7A3C] text-[#2B2420] font-semibold" : "text-[#D9CDB6]")
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </nav>
          )}
        </div>
      </header>

      {offline && (
        <div className="mx-auto max-w-6xl px-4 sm:px-5">
          <div className="mt-3 flex items-center gap-2 text-xs text-[#8A3C2F] bg-[#F3DFDA] border border-[#E3B6AC] rounded-lg px-4 py-2">
            <WifiOff size={14} />
            اتصال به سرور قطع شده — اطلاعات صفحه ممکنه قدیمی باشه. به‌محض وصل شدن خودش به‌روز می‌شه.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 sm:px-5 py-6">
        {!data ? (
          <div className="text-center py-24 text-sm text-[#6B5E4F]">در حال بارگذاری اطلاعات…</div>
        ) : view === "store" ? (
          <StoreView data={data} refresh={refresh} highlightId={highlightId} onJump={jumpToOrder} onFlash={flash} />
        ) : view === "workshop" ? (
          <WorkshopView data={data} refresh={refresh} highlightId={highlightId} />
        ) : view === "customers" ? (
          <CustomersView data={data} refresh={refresh} />
        ) : view === "history" ? (
          <HistoryView data={data} refresh={refresh} />
        ) : view === "reports" ? (
          <ReportsView data={data} />
        ) : view === "products" ? (
          <ProductsView data={data} refresh={refresh} />
        ) : view === "settings" ? (
          <SettingsView data={data} refresh={refresh} />
        ) : (
          <AuditView data={data} />
        )}
      </main>
    </div>
  );
}
