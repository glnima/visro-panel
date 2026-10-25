import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Role, User } from "@/lib/types";
import type { Queryable } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "mizan_session";
export const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

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
  const token = randomBytes(32).toString("base64url");
  await q.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, SESSION_DAYS]
  );
  await q.query("delete from sessions where expires_at < now()");
  return token;
}

export async function userForSession(q: Queryable, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const rows = await q.query<UserRow>(
    `select u.id, u.username, u.display_name, u.role, u.active
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [sha256(token)]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteSession(q: Queryable, token: string | undefined): Promise<void> {
  if (token) await q.query("delete from sessions where token_hash = $1", [sha256(token)]);
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
