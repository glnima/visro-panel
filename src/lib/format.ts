import { APP_TIMEZONE } from "./dates";

export function faDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(dateStr + "T00:00:00Z")
    );
  } catch {
    return dateStr;
  }
}

export function faDateFull(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(dateStr + "T00:00:00Z")
    );
  } catch {
    return dateStr;
  }
}

export function faTime(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE }).format(
      new Date(isoStr)
    );
  } catch {
    return "";
  }
}

export function faNum(n: number | string): string {
  return Number(n).toLocaleString("fa-IR");
}

export function faDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function faPrice(n: number | string): string {
  return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 0 });
}

// Accepts Persian, Arabic or Latin digits; returns NaN for anything else.
export function parseDigits(s: string): number {
  const latin = s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,٬،\s]/g, "");
  return /^\d+$/.test(latin) ? Number(latin) : NaN;
}
