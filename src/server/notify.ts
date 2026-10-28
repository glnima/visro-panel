import type { Role } from "@/lib/types";
import type { Queryable } from "./db";

// Runtime-neutral notification interface. The Node server registers a Web Push
// implementation (push-node.ts); the browser demo has none, so nothing is sent.

export type PushMessage = { title: string; body: string; url?: string; tag?: string };
export type Audience = { roles: Role[]; exceptUserId?: number };

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string; userAgent: string };

export interface PushService {
  publicKey(q: Queryable): Promise<string>;
  send(audience: Audience | { userIds: number[] }, message: PushMessage): Promise<void>;
}

const g = globalThis as unknown as { __mizanPush?: PushService };

export function setPushService(service: PushService | undefined) {
  g.__mizanPush = service;
}

export function getPushService(): PushService | undefined {
  return g.__mizanPush;
}
