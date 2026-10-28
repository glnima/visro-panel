import { DELAY_REASONS, type DelayReason } from "./types";

// Human labels for order_events kinds (activity log and order timeline).
export const EVENT_LABELS: Record<string, string> = {
  created: "سفارش رو ثبت کرد",
  edited: "سفارش رو ویرایش کرد",
  deleted: "سفارش رو حذف کرد",
  restored: "سفارش رو برگردوند",
  stage_done: "مرحله رو تمام کرد",
  stage_undone: "مرحله رو برگردوند",
  delay_reported: "تأخیر گزارش داد",
  delay_resolved: "تأخیر رو برطرف کرد",
  delivered: "تحویل داد",
  undelivered: "تحویل رو برگردوند",
  product_added: "محصول اضافه کرد",
  product_edited: "محصول رو ویرایش کرد",
  product_deleted: "محصول رو حذف کرد",
  product_restored: "محصول رو برگردوند",
  user_added: "کاربر ساخت",
  user_edited: "کاربر رو ویرایش کرد",
};

export function delayReasonText(details: Record<string, unknown>): string {
  const reason = DELAY_REASONS[details.reason as DelayReason];
  const note = typeof details.note === "string" ? details.note : "";
  return [reason, note].filter(Boolean).join(" — ");
}
