"use client";

import { useState } from "react";
import { useToast } from "../Toast";
import { api, errorMessage } from "@/lib/api";
import { nextStepMessage } from "@/lib/production";
import type { Bootstrap, DelayReason, Order, OrderItem, StageKey, StationKey } from "@/lib/types";

export type DelayInput = { reason: DelayReason; note: string; eta: string };

// Every write the production screens make, with toasts (and undo where it makes sense).
export function useProductionActions(data: Bootstrap, refresh: () => Promise<void>) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const label = (k: StationKey) => data.stations.find((s) => s.key === k)?.label ?? k;

  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const out = await fn();
      await refresh();
      return out;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const setStage = async (order: Order, item: OrderItem, stage: StageKey, done: boolean, withUndo = true): Promise<boolean> => {
    const res = await run(() => api<{ order: Order }>("POST", `/api/items/${item.id}/stage`, { stage, done }));
    if (!res) return false;
    const fresh = res.order.items.find((i) => i.id === item.id);
    const next = done && fresh ? nextStepMessage(fresh.production, data.stations) : "";
    toast.ok(
      done
        ? `${label(stage)} «${item.productName}» (${order.code}) تمام شد${next ? " — " + next : ""}`
        : `${label(stage)} «${item.productName}» (${order.code}) برگشت`,
      withUndo ? { label: "واگرد", run: () => void setStage(order, item, stage, !done, false) } : undefined
    );
    return true;
  };

  const reportDelay = async (order: Order, item: OrderItem, stage: StageKey, input: DelayInput): Promise<boolean> => {
    const res = await run(() =>
      api("POST", `/api/items/${item.id}/delays`, { stage, reason: input.reason, note: input.note, eta: input.eta || null })
    );
    if (!res) return false;
    toast.ok(`تأخیر ${label(stage)} «${item.productName}» (${order.code}) ثبت شد`);
    return true;
  };

  const resolveDelay = async (order: Order, item: OrderItem, delayId: number): Promise<boolean> => {
    const res = await run(() => api("POST", `/api/delays/${delayId}/resolve`));
    if (!res) return false;
    toast.ok(`تأخیر «${item.productName}» (${order.code}) برطرف شد`);
    return true;
  };

  const setDelivered = async (order: Order, delivered: boolean, withUndo = true): Promise<boolean> => {
    const res = await run(() => api("POST", `/api/orders/${order.id}/deliver`, { delivered }));
    if (!res) return false;
    toast.ok(
      delivered ? `سفارش ${order.code} تحویل داده شد` : `تحویل سفارش ${order.code} برگشت`,
      withUndo ? { label: "واگرد", run: () => void setDelivered(order, !delivered, false) } : undefined
    );
    return true;
  };

  return { busy, label, setStage, reportDelay, resolveDelay, setDelivered };
}

export type ProductionActions = ReturnType<typeof useProductionActions>;
