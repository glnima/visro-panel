import type { Role, User } from "@/lib/types";
import type { Queryable } from "./db";

// Web Crypto only, so this runs both in Node and in the browser demo.
const subtle = globalThis.crypto.subtle;

export const SESSION_COOKIE = "mizan_session";
// Long-lived and sliding: every day the app is used, the session (and cookie)
// is pushed out again, so people who use it regularly never have to log in again.
export const SESSION_DAYS = 180;
const PBKDF2_ITERATIONS = 210_000;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, saltB64, keyB64] = stored.split("$");
  if (algo !== "pbkdf2" || !iter || !saltB64 || !keyB64) return false;
  const expected = fromB64(keyB64);
  const actual = await pbkdf2(password, fromB64(saltB64), Number(iter));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function sha256(s: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type UserRow = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
};

export function toUser(r: UserRow): User {
  return { id: r.id, username: r.username, displayName: r.display_name, role: r.role, active: r.active };
}

export async function createSession(q: Queryable, userId: number): Promise<string> {
  const token = toB64(randomBytes(32)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await q.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [await sha256(token), userId, SESSION_DAYS]
  );
  await q.query("delete from sessions where expires_at < now()");
  return token;
}

export async function userForSession(q: Queryable, token: string | undefined): Promise<{ user: User; renewed: boolean } | null> {
  if (!token) return null;
  const hash = await sha256(token);
  const rows = await q.query<UserRow & { stale: boolean }>(
    `select u.id, u.username, u.display_name, u.role, u.active, s.renewed_at < now() - interval '1 day' as stale
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [hash]
  );
  if (!rows[0]) return null;
  if (rows[0].stale) {
    await q.query(
      "update sessions set expires_at = now() + make_interval(days => $2), renewed_at = now() where token_hash = $1",
      [hash, SESSION_DAYS]
    );
  }
  return { user: toUser(rows[0]), renewed: rows[0].stale };
}

export async function deleteSession(q: Queryable, token: string | undefined): Promise<void> {
  if (token) await q.query("delete from sessions where token_hash = $1", [await sha256(token)]);
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 86400}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
