"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Undo2 } from "lucide-react";
import JalaliDateInput from "../JalaliDateInput";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "../ui";
import { STATE_STYLE } from "./StageCell";
import type { ProductionActions } from "./useProductionActions";
import { localDate, todayISO } from "@/lib/dates";
import { faDateFull, faNum, faTime } from "@/lib/format";
import { itemColors, openDelay, stageChangeError, stageState } from "@/lib/production";
import { DELAY_REASONS, ROLE_LABELS, canWorkStage, type DelayReason, type Order, type OrderItem, type Role, type StageKey } from "@/lib/types";

type Props = {
  order: Order;
  item: OrderItem;
  stage: StageKey;
  role: Role;
  actions: ProductionActions;
  onClose: () => void;
  startWithDelay?: boolean;
};

export default function StageDialog({ order, item, stage, role, actions, onClose, startWithDelay }: Props) {
  const state = stageState(item, stage);
  const delay = openDelay(item, stage);
  const done = item.done[stage];
  const mine = canWorkStage(role, stage);
  const stageLabel = actions.label(stage);
  const [delayForm, setDelayForm] = useState(startWithDelay ?? false);
  const [reason, setReason] = useState<DelayReason>(delay?.reason ?? "materials");
  const [note, setNote] = useState(delay?.note ?? "");
  const [eta, setEta] = useState(delay?.eta ?? "");
  const { cls, label, Icon } = STATE_STYLE[state];
  const canFinish = state === "active" || (state === "delayed" && !stageChangeError(item.production, stage, true));
  const undoBlocked = state === "done" ? stageChangeError(item.production, stage, false) : null;

  const act = async (fn: () => Promise<boolean>) => {
    if (await fn()) onClose();
  };

  const submitDelay = (e: FormEvent) => {
    e.preventDefault();
    act(() => actions.reportDelay(order, item, stage, { reason, note: note.trim(), eta }));
  };

  return (
    <Modal title={`${stageLabel} — ${item.productName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="text-xs text-[#6B5E4F]">
          {order.code}، {order.customer}، {item.productName} × {faNum(item.qty)}
          {itemColors(item) && `، ${itemColors(item)}`}
        </div>

        <div className={"rounded-lg border px-3 py-2.5 text-sm " + cls}>
          <div className="flex items-center gap-1.5 font-semibold">
            <Icon size={15} />
            {label}
          </div>
          {state === "done" && done && (
            <div className="text-xs mt-1">
              {done.by ?? "—"}، {faDateFull(localDate(done.at))} — ساعت {faTime(done.at)}
            </div>
          )}
          {state === "waiting" && <div className="text-xs mt-1">هنوز مرحله‌های قبلی این قلم تمام نشده.</div>}
          {delay && (
            <div className="text-xs mt-1 leading-6">
              <div>
                دلیل: <b>{DELAY_REASONS[delay.reason]}</b>
                {delay.note && ` — ${delay.note}`}
              </div>
              {delay.eta && <div>تخمین تمام شدن: {faDateFull(delay.eta)}</div>}
              <div className="opacity-80">
                گزارش: {delay.by ?? "—"}، {faDateFull(localDate(delay.at))}
              </div>
            </div>
          )}
        </div>

        {!mine && (
          <p className="text-xs text-[#8A7B60]">
            فقط {stageLabel} یا {ROLE_LABELS.workshop} می‌تونه این مرحله رو ثبت کنه.
          </p>
        )}

        {mine && !delayForm && (
          <div className="flex flex-wrap gap-2">
            {canFinish && (
              <button onClick={() => act(() => actions.setStage(order, item, stage, true))} disabled={actions.busy} className={primaryBtn}>
                <CheckCircle2 size={15} />
                {stageLabel} تمام شد
              </button>
            )}
            {state !== "done" && (
              <button onClick={() => setDelayForm(true)} className={secondaryBtn + " !border-[#FCA5A5] !text-[#991B1B]"}>
                <AlertTriangle size={15} />
                {delay ? "ویرایش تأخیر" : "تأخیر دارد"}
              </button>
            )}
            {delay && (
              <button onClick={() => act(() => actions.resolveDelay(order, item, delay.id))} disabled={actions.busy} className={secondaryBtn}>
                تأخیر برطرف شد
              </button>
            )}
            {state === "done" && (
              <button
                onClick={() => act(() => actions.setStage(order, item, stage, false))}
                disabled={actions.busy || !!undoBlocked}
                title={undoBlocked ?? ""}
                className={secondaryBtn}
              >
                <Undo2 size={15} />
                برگردون
              </button>
            )}
            {undoBlocked && <span className="text-[11px] text-[#8A7B60] self-center">{undoBlocked}</span>}
          </div>
        )}

        {mine && delayForm && (
          <form onSubmit={submitDelay} className="flex flex-col gap-3 rounded-lg border border-[#FCA5A5] bg-[#FFF7F7] p-3">
            <div className="text-xs font-semibold text-[#991B1B]">چرا تأخیر داره؟</div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="دلیل تأخیر">
              {(Object.keys(DELAY_REASONS) as DelayReason[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={
                    "rounded-full border px-3 py-1 text-xs " +
                    (reason === r ? "bg-[#991B1B] border-[#991B1B] text-white" : "bg-white border-[#E4DCC8] text-[#4A2E22]")
                  }
                >
                  {DELAY_REASONS[r]}
                </button>
              ))}
            </div>
            <label className={labelCls}>
              توضیح {reason === "other" ? "(لازمه)" : "(اختیاری)"}
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls + " resize-none"} placeholder="مثلاً از کدوم تأمین‌کننده، چی کم داریم…" />
            </label>
            <label className={labelCls}>
              کِی تمام می‌شه؟ (تخمین)
              <JalaliDateInput value={eta} onChange={setEta} emptyLabel="نامشخص" min={todayISO()} />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={actions.busy} className={primaryBtn + " !bg-[#991B1B]"}>
                ثبت تأخیر
              </button>
              <button type="button" onClick={() => setDelayForm(false)} className={secondaryBtn}>
                انصراف
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
