import { isIsoDate } from "@/lib/dates";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = "پیدا نشد") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

export type Body = Record<string, unknown>;

export function asBody(v: unknown): Body {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw bad("درخواست نامعتبره");
  return v as Body;
}

export function text(v: unknown, field: string, { max = 200, required = false } = {}): string {
  if (v === undefined || v === null) {
    if (required) throw bad(`${field} رو وارد کن`);
    return "";
  }
  if (typeof v !== "string") throw bad(`${field} نامعتبره`);
  const s = v.trim();
  if (required && !s) throw bad(`${field} رو وارد کن`);
  if (s.length > max) throw bad(`${field} خیلی طولانیه`);
  return s;
}

export function int(v: unknown, field: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw bad(`${field} نامعتبره`);
  return n;
}

export function isoDate(v: unknown, field: string): string {
  if (!isIsoDate(v)) throw bad(`${field} نامعتبره`);
  return v;
}

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") throw bad(`${field} نامعتبره`);
  return v;
}

export function array(v: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(v)) throw bad(`${field} نامعتبره`);
  if (v.length > max) throw bad(`${field} خیلی زیاده`);
  return v;
}
