// NOTE: daysAgo uses toISOString() (UTC), so between 00:00 and 03:30 in Iran
// it returns yesterday. Kept as in the prototype; fixed in Phase 1.
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function daysFromNow(n: number): string {
  return daysAgo(-n);
}

export function faDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long" }).format(new Date(dateStr + "T00:00:00"));
  } catch {
    return dateStr;
  }
}

export function faTime(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(isoStr));
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
  return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
}
