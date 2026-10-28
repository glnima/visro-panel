"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Download, Share, SquarePlus } from "lucide-react";
import { useToast } from "./Toast";
import { Modal, primaryBtn, secondaryBtn } from "./ui";
import { DEMO, api, errorMessage } from "@/lib/api";
import {
  canPromptInstall,
  disablePush,
  enablePush,
  isStandalone,
  onInstallChange,
  platform,
  promptInstall,
  pushState,
  type Platform,
  type PushState,
} from "@/lib/pwa";

const headerBtn = "flex items-center gap-1 rounded-md border border-[#5C4033] px-2 py-1 hover:bg-[#4A2E22]";

const useCanPrompt = () => useSyncExternalStore(onInstallChange, canPromptInstall, () => false);

// ---- install ----

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3B241A] text-xs text-white">{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

function instructions(p: Platform): React.ReactNode {
  switch (p) {
    case "ios":
      return (
        <Steps
          items={[
            <>توی <b>Safari</b> (یا کروم) دکمه‌ی اشتراک‌گذاری <Share size={14} className="inline" /> پایین یا بالای صفحه رو بزن.</>,
            <>گزینه‌ی <b>Add to Home Screen</b> (افزودن به صفحه‌ی اصلی) <SquarePlus size={14} className="inline" /> رو انتخاب کن.</>,
            <><b>Add</b> رو بزن. آیکون میزان روی صفحه‌ی اصلی میاد؛ از این به بعد از همون باز کن.</>,
          ]}
        />
      );
    case "mac-safari":
      return (
        <Steps
          items={[
            <>توی Safari از منوی <b>File</b> گزینه‌ی <b>Add to Dock…</b> رو بزن (Safari 17 به بعد).</>,
            <><b>Add</b> رو بزن تا میزان مثل یه برنامه توی Dock و Launchpad بیاد.</>,
          ]}
        />
      );
    case "android":
      return (
        <Steps
          items={[
            <>منوی مرورگر (⋮) رو باز کن.</>,
            <><b>Install app</b> یا <b>Add to Home screen</b> (نصب برنامه / افزودن به صفحه‌ی اصلی) رو بزن.</>,
          ]}
        />
      );
    default:
      return (
        <Steps
          items={[
            <>با <b>Chrome</b> یا <b>Edge</b> باز کن.</>,
            <>توی نوار آدرس روی آیکون نصب <Download size={14} className="inline" /> بزن، یا از منوی مرورگر <b>Install</b> رو انتخاب کن.</>,
          ]}
        />
      );
  }
}

// Shows nothing once running as an installed app.
export function InstallButton({ compact }: { compact?: boolean }) {
  const toast = useToast();
  const canPrompt = useCanPrompt();
  const [open, setOpen] = useState(false);
  const standalone = useSyncExternalStore(() => () => {}, isStandalone, () => true);
  if (standalone) return null;

  const click = async () => {
    if (canPrompt) {
      if (await promptInstall()) toast.ok("میزان نصب شد — از این به بعد از آیکونش باز کن");
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button onClick={click} className={compact ? secondaryBtn + " !py-1.5 text-xs" : headerBtn} title="نصب میزان روی این دستگاه">
        <Download size={13} />
        نصب برنامه
      </button>
      {open && (
        <Modal title="نصب میزان روی این دستگاه" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-[#6B5E4F]">
              نصب‌شده‌ی میزان مثل یه برنامه‌ی معمولی از صفحه‌ی اصلی باز می‌شه، تمام‌صفحه‌ست و یه بار که وارد بشی، دفعه‌های بعد مستقیم باز می‌شه.
            </p>
            {instructions(platform())}
          </div>
        </Modal>
      )}
    </>
  );
}

// ---- notifications ----

const STATE_TEXT: Record<PushState, string> = {
  unsupported: "این مرورگر اعلان پشتیبانی نمی‌کنه. با Chrome، Edge، Safari یا Firefox جدید امتحان کن.",
  "needs-install": "روی آیفون و آیپد اعلان فقط برای برنامه‌ی نصب‌شده کار می‌کنه. اول میزان رو به صفحه‌ی اصلی اضافه کن، از همون باز کن و دوباره اینجا بیا.",
  denied: "اعلان‌ها برای این سایت توی تنظیمات مرورگر بسته شده. از تنظیمات سایت (آیکون قفل کنار آدرس) اجازه‌ی اعلان رو بده و دوباره امتحان کن.",
  off: "اعلان‌ها روی این دستگاه خاموشه.",
  on: "اعلان‌ها روی این دستگاه روشنه.",
};

export function NotificationsButton() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pushState().then((s) => !cancelled && setState(s));
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (DEMO) return null; // the static demo has no server to send pushes

  const run = async (fn: () => Promise<PushState>, ok?: string) => {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      if (ok && next === "on") toast.ok(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/push/test");
      toast.ok("اعلان آزمایشی فرستاده شد");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={headerBtn} title="اعلان‌ها" aria-label="اعلان‌ها">
        {state === "on" ? <Bell size={13} /> : <BellOff size={13} />}
        <span className="hidden sm:inline">اعلان‌ها</span>
      </button>
      {open && (
        <Modal title="اعلان‌ها" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-[#6B5E4F] leading-6">
              وقتی کاری به ایستگاه تو می‌رسه، تأخیری گزارش می‌شه یا سفارشی آماده‌ی تحویله، حتی اگه برنامه بسته باشه خبرت می‌کنیم. فقط چیزهایی که به نقش تو مربوطه.
            </p>
            <div
              className={
                "rounded-lg border px-3 py-2.5 " +
                (state === "on" ? "border-[#86EFAC] bg-[#DCFCE7] text-[#166534]" : "border-[#E4DCC8] bg-[#F5F1E8] text-[#4A2E22]")
              }
            >
              {state ? STATE_TEXT[state] : "در حال بررسی…"}
            </div>
            <div className="flex flex-wrap gap-2">
              {state === "off" && (
                <button disabled={busy} onClick={() => run(enablePush, "اعلان‌ها روشن شد")} className={primaryBtn}>
                  <Bell size={15} />
                  روشن کردن اعلان‌ها
                </button>
              )}
              {state === "on" && (
                <>
                  <button disabled={busy} onClick={test} className={primaryBtn}>
                    فرستادن اعلان آزمایشی
                  </button>
                  <button disabled={busy} onClick={() => run(disablePush)} className={secondaryBtn}>
                    <BellOff size={15} />
                    خاموش کردن
                  </button>
                </>
              )}
              {state === "needs-install" && <InstallButton compact />}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
