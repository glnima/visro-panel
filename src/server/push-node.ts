import webpush from "web-push";
import { getDb, type Queryable } from "./db";
import { setPushService, type Audience, type PushMessage } from "./notify";

// Web Push for the Node server. VAPID keys come from VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY when set, otherwise they're generated once and kept in the
// database, so notifications work with no setup on any host.

let keys: { publicKey: string; privateKey: string } | null = null;

async function vapid(q: Queryable) {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const read = async () => {
      const rows = await q.query<{ key: string; value: string }>(
        "select key, value from app_settings where key in ('vapid_public', 'vapid_private')"
      );
      const m = new Map(rows.map((r) => [r.key, r.value]));
      return m.get("vapid_public") && m.get("vapid_private") ? { publicKey: m.get("vapid_public")!, privateKey: m.get("vapid_private")! } : null;
    };
    keys = await read();
    if (!keys) {
      const fresh = webpush.generateVAPIDKeys();
      await q.query(
        "insert into app_settings (key, value) values ('vapid_public', $1), ('vapid_private', $2) on conflict (key) do nothing",
        [fresh.publicKey, fresh.privateKey]
      );
      keys = await read(); // another instance may have won the race
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://github.com/glnima/visro-panel", keys!.publicKey, keys!.privateKey);
  return keys!;
}

async function send(audience: Audience | { userIds: number[] }, message: PushMessage) {
  const db = await getDb();
  await vapid(db);
  const subs =
    "userIds" in audience
      ? await db.query<{ id: number; endpoint: string; p256dh: string; auth: string }>(
          `select s.id, s.endpoint, s.p256dh, s.auth from push_subscriptions s join users u on u.id = s.user_id
            where u.active and s.user_id = any($1::int[])`,
          [audience.userIds]
        )
      : await db.query<{ id: number; endpoint: string; p256dh: string; auth: string }>(
          `select s.id, s.endpoint, s.p256dh, s.auth from push_subscriptions s join users u on u.id = s.user_id
            where u.active and u.role = any($1::text[]) and u.id <> $2`,
          [audience.roles, audience.exceptUserId ?? 0]
        );
  const payload = JSON.stringify(message);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 24,
          timeout: 5000,
          urgency: "normal",
        });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // the browser dropped this subscription (app uninstalled, permission revoked)
        if (status === 404 || status === 410) await db.query("delete from push_subscriptions where id = $1", [s.id]);
        else console.error("push failed", status ?? e);
      }
    })
  );
}

setPushService({
  publicKey: async (q) => (await vapid(q)).publicKey,
  send,
});
