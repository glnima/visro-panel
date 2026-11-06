import { addDays, todayISO } from "@/lib/dates";
import { normalizeName, searchKey } from "@/lib/text";
import { fullProduction, isOrderReady, itemStations, orderTotals, stageChangeError } from "@/lib/production";
import {
  DELAY_REASONS,
  MAX_PRODUCTS,
  PAYMENT_METHODS,
  ROLES,
  STAGES,
  canDeliver,
  canEditMaterials,
  canSeeInventory,
  canWorkStage,
  type OptionKind,
  type OrderMode,
  type PaymentMethod,
  type DelayReason,
  type Order,
  type Production,
  type Role,
  type StageKey,
  type User,
} from "@/lib/types";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  readCookie,
  sessionCookie,
  toUser,
  userForSession,
  verifyPassword,
  type UserRow,
} from "./auth";
import { getDb, type Queryable } from "./db";
import {
  HttpError,
  array,
  asBody,
  bad,
  bool,
  conflict,
  decimal,
  int,
  isoDate,
  notFound,
  text,
  type Body,
} from "./http";
import {
  bumpVersion,
  canSeePrices,
  getVersion,
  loadBootstrap,
  loadOrder,
  loadStations,
  logEvent,
} from "./repo";
import { getPushService, type Audience, type PushMessage } from "./notify";
import { moveStock, syncItemStock } from "./stock";

// "cookie": normal server (httpOnly cookie). "header": the in-browser demo, where
// scripts can't set cookies on a Request, so the token travels in x-mizan-session
// and is returned in the login response body.
export type HandleOptions = { session?: "cookie" | "header" };

type Ctx = {
  req: Request;
  url: URL;
  q: Queryable;
  me: User;
  body: Body;
  params: string[];
  token: string | undefined;
  opts: HandleOptions;
  after: (() => Promise<void>)[]; // run once the transaction has committed
};

// Queues a push notification; it's only sent if the change is actually saved.
function notify(ctx: Ctx, audience: Audience | { userIds: number[] }, message: PushMessage) {
  const service = getPushService();
  if (service) ctx.after.push(() => service.send(audience, message));
}

const stationLabels = async (q: Queryable) => new Map((await loadStations(q)).map((s) => [s.key, s.label]));

function isSecure(req: Request) {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

// Tell the workers whose station an order just reached, and the shop when it's ready.
async function notifyOrderProgress(ctx: Ctx, before: Order | null, after: Order) {
  const labels = await stationLabels(ctx.q);
  const url = `./?order=${after.id}`;
  for (const it of after.items) {
    const was = new Set(before?.items.find((b) => b.id === it.id) ? itemStations(before.items.find((b) => b.id === it.id)!.production) : []);
    for (const s of itemStations(it.production)) {
      if (was.has(s)) continue;
      notify(ctx, { roles: [s], exceptUserId: ctx.me.id }, {
        title: `کار جدید برای ${labels.get(s) ?? s}`,
        body: `${it.productName} × ${it.qty} — ${after.customer} (${after.code})`,
        url,
        tag: `stage-${it.id}-${s}`,
      });
    }
  }
  if (isOrderReady(after) && !(before && isOrderReady(before))) {
    notify(ctx, { roles: ["store", "workshop", "admin"], exceptUserId: ctx.me.id }, {
      title: `سفارش ${after.code} آماده‌ی تحویله`,
      body: `${after.customer} — ${orderTotals(after).summary}`,
      url,
      tag: `ready-${after.id}`,
    });
  }
}

type Access = "public" | "auth" | Role[];
type Handler = (ctx: Ctx) => Promise<unknown>;
type Route = { method: string; pattern: RegExp; access: Access; handler: Handler };

const routes: Route[] = [];
const route = (method: string, path: string, access: Access, handler: Handler) => {
  const pattern = new RegExp("^" + path.replace(/:[a-z]+/g, "([^/]+)") + "$");
  routes.push({ method, pattern, access, handler });
};

const DELIVERY: Role[] = ROLES.filter(canDeliver);
const OFFICE: Role[] = ROLES.filter(canSeeInventory);
const WAREHOUSE: Role[] = ROLES.filter(canEditMaterials);
const SALES: Role[] = ["admin", "store"];
const ADMIN: Role[] = ["admin"];

const idParam = (ctx: Ctx, i = 0) => int(ctx.params[i], "شناسه", { min: 1 });

// ---------------------------------------------------------------- auth

route("GET", "/api/health", "public", async () => ({ ok: true }));

route("GET", "/api/session", "public", async (ctx) => {
  const users = await ctx.q.query<{ n: number }>("select count(*)::int as n from users");
  return { me: ctx.me ?? null, needsSetup: users[0].n === 0 };
});

function withSession(ctx: Ctx, token: string, payload: Record<string, unknown>): Response {
  if (ctx.opts.session === "header") return Response.json({ ...payload, token });
  return Response.json(payload, { headers: { "set-cookie": sessionCookie(token, isSecure(ctx.req)) } });
}

route("POST", "/api/setup", "public", async (ctx) => {
  const users = await ctx.q.query<{ n: number }>("select count(*)::int as n from users");
  if (users[0].n > 0) throw conflict("حساب مدیر قبلاً ساخته شده");
  const user = await insertUser(ctx.q, { ...ctx.body, role: "admin" });
  const token = await createSession(ctx.q, user.id);
  return withSession(ctx, token, { me: user });
});

route("POST", "/api/login", "public", async (ctx) => {
  const username = text(ctx.body.username, "نام کاربری", { required: true, max: 50 }).toLowerCase();
  const password = text(ctx.body.password, "رمز عبور", { required: true, max: 200 });
  const rows = await ctx.q.query<UserRow & { password_hash: string }>(
    "select id, username, display_name, role, active, password_hash from users where username = $1",
    [username]
  );
  const row = rows[0];
  if (!row || !row.active || !(await verifyPassword(password, row.password_hash))) {
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, "نام کاربری یا رمز عبور اشتباهه");
  }
  const token = await createSession(ctx.q, row.id);
  return withSession(ctx, token, { me: toUser(row) });
});

route("POST", "/api/logout", "public", async (ctx) => {
  await deleteSession(ctx.q, ctx.token);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});

// ---------------------------------------------------------------- data

route("GET", "/api/bootstrap", "auth", async (ctx) => loadBootstrap(ctx.q, ctx.me));

route("GET", "/api/version", "auth", async (ctx) => ({ version: await getVersion(ctx.q) }));

// ---------------------------------------------------------------- orders

type ItemInput = { id: number | null; productId: number; qty: number; fabricColor: string; woodColor: string };

function parseItems(v: unknown): ItemInput[] {
  const list = array(v, "اقلام", 50);
  if (list.length === 0) throw bad("حداقل یه مدل به سفارش اضافه کن");
  return list.map((raw) => {
    const it = asBody(raw);
    return {
      id: it.id === undefined || it.id === null ? null : int(it.id, "قلم", { min: 1 }),
      productId: int(it.productId, "مدل", { min: 1 }),
      qty: int(it.qty, "تعداد", { min: 1, max: 999 }),
      fabricColor: text(it.fabricColor, "رنگ پارچه", { max: 100 }),
      woodColor: text(it.woodColor, "رنگ چوب", { max: 100 }),
    };
  });
}

async function findOrCreateCustomer(q: Queryable, rawName: string): Promise<number> {
  const name = normalizeName(rawName);
  // reuse a customer whose name differs only in spacing, half-spaces or ی/ي
  const key = searchKey(name);
  const existing = (await q.query<{ id: number; name: string }>("select id, name from customers")).find((c) => searchKey(c.name) === key);
  if (existing) return existing.id;
  const rows = await q.query<{ id: number }>(
    `insert into customers (name) values ($1)
       on conflict (name) do update set name = excluded.name
     returning id`,
    [name]
  );
  return rows[0].id;
}

async function productSnapshot(q: Queryable, productId: number) {
  const rows = await q.query<{ name: string; price: number; active: boolean }>(
    "select name, price, active from products where id = $1",
    [productId]
  );
  if (!rows[0] || !rows[0].active) throw bad("این مدل دیگه توی لیست نیست");
  return rows[0];
}

const stageCols = (p: Production) => STAGES.map((s) => p[s]);

async function insertItem(q: Queryable, orderId: number, position: number, it: ItemInput, production: Production): Promise<number> {
  const snap = await productSnapshot(q, it.productId);
  const [row] = await q.query<{ id: number }>(
    `insert into order_items (order_id, position, product_id, product_name, unit_price, qty, fabric_color, wood_color,
                              ${STAGES.join(", ")})
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
    [orderId, position, it.productId, snap.name, snap.price, it.qty, it.fabricColor, it.woodColor, ...stageCols(production)]
  );
  return row.id;
}

// Takes finished pieces out of the shop; refuses to go below zero.
async function takeReadyStock(q: Queryable, productId: number, qty: number) {
  const rows = await q.query("update products set ready_stock = ready_stock - $2 where id = $1 and ready_stock >= $2 returning id", [productId, qty]);
  if (rows[0]) return;
  const [p] = await q.query<{ name: string; ready_stock: number }>("select name, ready_stock from products where id = $1", [productId]);
  throw conflict(`از «${p?.name ?? "این مدل"}» فقط ${p?.ready_stock ?? 0} عدد آماده توی فروشگاه داریم — موجودی آماده رو توی بخش انبار اصلاح کن`);
}

// Warn the people who buy materials when an order pushes one to or below its minimum.
async function notifyLowStock(ctx: Ctx, materialIds: number[]) {
  if (materialIds.length === 0) return;
  const low = await ctx.q.query<{ id: number; name: string; unit: string; stock: number }>(
    "select id, name, unit, stock from materials where id = any($1::int[]) and (stock < 0 or (min_stock > 0 and stock <= min_stock))",
    [materialIds]
  );
  for (const m of low) {
    notify(ctx, { roles: ["admin", "workshop"], exceptUserId: ctx.me.id }, {
      title: m.stock < 0 ? `کسری انبار: ${m.name}` : `${m.name} رو به اتمامه`,
      body: `موجودی: ${m.stock} ${m.unit}`,
      tag: `stock-${m.id}`,
    });
  }
}

function parseMethod(v: unknown): PaymentMethod {
  if (typeof v !== "string" || !(v in PAYMENT_METHODS)) throw bad("روش پرداخت نامعتبره");
  return v as PaymentMethod;
}

async function addPayment(
  ctx: Ctx,
  orderId: number,
  p: { amount: number; method: PaymentMethod; paidOn: string; note: string }
) {
  const [{ total, paid }] = await ctx.q.query<{ total: number; paid: number }>(
    `select (select coalesce(sum(qty * unit_price), 0)::float8 from order_items where order_id = $1) as total,
            (select coalesce(sum(amount), 0)::float8 from payments where order_id = $1 and voided_at is null) as paid`,
    [orderId]
  );
  if (p.amount > total - paid) throw conflict("مبلغ از مانده‌ی این سفارش بیشتره");
  const [row] = await ctx.q.query<{ id: number }>(
    "insert into payments (order_id, amount, method, paid_on, note, created_by) values ($1, $2, $3, $4, $5, $6) returning id",
    [orderId, p.amount, p.method, p.paidOn, p.note, ctx.me.id]
  );
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "payment_added", orderId, details: { amount: p.amount, method: p.method, note: p.note } });
  return row.id;
}

function paymentFields(body: Body) {
  const paidOn = body.paidOn ? isoDate(body.paidOn, "تاریخ پرداخت") : todayISO();
  if (paidOn > todayISO()) throw bad("تاریخ پرداخت نمی‌تونه توی آینده باشه");
  return {
    amount: int(body.amount, "مبلغ", { min: 1, max: 1e15 }),
    method: parseMethod(body.method ?? "cash"),
    paidOn,
    note: text(body.note, "توضیح", { max: 500 }),
  };
}

function orderFields(body: Body) {
  const orderDate = body.orderDate ? isoDate(body.orderDate, "تاریخ سفارش") : todayISO();
  const requested = body.requested ? isoDate(body.requested, "تاریخ تحویل") : addDays(orderDate, 14);
  if (requested < orderDate) throw bad("تاریخ تحویل نمی‌تونه قبل از تاریخ سفارش باشه");
  return {
    customer: text(body.customer, "نام مشتری", { required: true, max: 120 }),
    orderDate,
    requested,
    notes: text(body.notes, "توضیحات", { max: 2000 }),
    items: parseItems(body.items),
  };
}

async function respondOrder(ctx: Ctx, id: number) {
  return { order: await loadOrder(ctx.q, { id }, canSeePrices(ctx.me), { includeDeleted: true }) };
}

route("POST", "/api/orders", SALES, async (ctx) => {
  const f = orderFields(ctx.body);
  const mode = (ctx.body.mode ?? "production") as OrderMode;
  if (!["production", "ready", "sold"].includes(mode)) throw bad("نوع سفارش نامعتبره");
  const fromStock = mode !== "production";
  const today = todayISO();
  const sold = mode === "sold";
  const customerId = await findOrCreateCustomer(ctx.q, f.customer);
  const [row] = await ctx.q.query<{ id: number }>(
    `insert into orders (code, customer_id, order_date, requested, notes, created_by, from_stock, delivered_at)
     values ('SF-' || nextval('order_code_seq'), $1, $2, $3, $4, $5, $6, $7) returning id`,
    // a piece handed over on the spot was promised for today
    [customerId, f.orderDate, sold && f.orderDate <= today ? today : f.requested, f.notes, ctx.me.id, fromStock, sold ? today : null]
  );
  const production = fromStock ? fullProduction() : { carpentry: false, zirkar: false, rangkar: false, tailor: false, ruyekoob: false };
  const touched = new Set<number>();
  for (const [i, it] of f.items.entries()) {
    const itemId = await insertItem(ctx.q, row.id, i, it, production);
    if (fromStock) await takeReadyStock(ctx.q, it.productId, it.qty);
    else {
      for (const m of await syncItemStock(ctx.q, { orderId: row.id, itemId, productId: it.productId, qty: it.qty, userId: ctx.me.id })) touched.add(m);
    }
  }
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "created", orderId: row.id, details: { mode } });
  if (sold) await logEvent(ctx.q, { userId: ctx.me.id, kind: "delivered", orderId: row.id });
  if (ctx.body.payment) await addPayment(ctx, row.id, paymentFields(asBody(ctx.body.payment)));
  const created = await loadOrder(ctx.q, { id: row.id }, false);
  if (created && !sold) await notifyOrderProgress(ctx, null, created);
  await notifyLowStock(ctx, [...touched]);
  return respondOrder(ctx, row.id);
});

async function lockOrder(q: Queryable, id: number) {
  const rows = await q.query<{ id: number; version: number; delivered_at: string | null; deleted_at: string | null; from_stock: boolean }>(
    "select id, version, delivered_at, deleted_at, from_stock from orders where id = $1 for update",
    [id]
  );
  if (!rows[0]) throw notFound("سفارش پیدا نشد");
  return rows[0];
}

const touchOrder = (q: Queryable, id: number) => q.query("update orders set version = version + 1 where id = $1", [id]);

route("PATCH", "/api/orders/:id", SALES, async (ctx) => {
  const id = idParam(ctx);
  const current = await lockOrder(ctx.q, id);
  if (current.deleted_at) throw notFound("سفارش پیدا نشد");
  if (current.delivered_at) throw conflict("سفارش تحویل‌شده رو نمی‌شه ویرایش کرد");
  if (int(ctx.body.version, "نسخه", { min: 1 }) !== current.version) {
    throw conflict("یه نفر دیگه همین الان این سفارش رو تغییر داد — صفحه رو تازه کن و دوباره امتحان کن");
  }
  const f = orderFields(ctx.body);
  const before = await ctx.q.query<{ id: number; product_id: number | null; qty: number }>("select id, product_id, qty from order_items where order_id = $1", [id]);
  if (current.from_stock) {
    // these pieces already left shop stock; changing them would need a stock recount
    const same = f.items.length === before.length && f.items.every((it) => before.some((b) => b.id === it.id && b.product_id === it.productId && b.qty === it.qty));
    if (!same) throw conflict("مدل و تعداد سفارشی که از موجودی فروشگاه فروخته شده عوض نمی‌شه — حذفش کن و دوباره ثبت کن");
  }
  const customerId = await findOrCreateCustomer(ctx.q, f.customer);
  await ctx.q.query(
    "update orders set customer_id = $2, order_date = $3, requested = $4, notes = $5, version = version + 1 where id = $1",
    [id, customerId, f.orderDate, f.requested, f.notes]
  );

  const existing = await ctx.q.query<{ id: number; product_id: number | null }>(
    "select id, product_id from order_items where order_id = $1",
    [id]
  );
  const existingIds = new Map(existing.map((r) => [r.id, r.product_id]));
  const keep = new Set<number>();
  const touched = new Set<number>();
  const sync = async (itemId: number, productId: number | null, qty: number) => {
    for (const m of await syncItemStock(ctx.q, { orderId: id, itemId, productId, qty, userId: ctx.me.id })) touched.add(m);
  };
  for (const [i, it] of f.items.entries()) {
    if (it.id === null) {
      const itemId = await insertItem(ctx.q, id, i, it, { carpentry: false, zirkar: false, rangkar: false, tailor: false, ruyekoob: false });
      await sync(itemId, it.productId, it.qty);
      continue;
    }
    if (!existingIds.has(it.id)) throw bad("قلم نامعتبره");
    keep.add(it.id);
    if (existingIds.get(it.id) === it.productId) {
      await ctx.q.query(
        "update order_items set position = $2, qty = $3, fabric_color = $4, wood_color = $5 where id = $1",
        [it.id, i, it.qty, it.fabricColor, it.woodColor]
      );
    } else {
      const snap = await productSnapshot(ctx.q, it.productId);
      await ctx.q.query(
        `update order_items set position = $2, qty = $3, fabric_color = $4, wood_color = $5,
                                product_id = $6, product_name = $7, unit_price = $8 where id = $1`,
        [it.id, i, it.qty, it.fabricColor, it.woodColor, it.productId, snap.name, snap.price]
      );
    }
    // unchanged lines keep what they took, even if the recipe has changed since
    const was = before.find((b) => b.id === it.id);
    if (!current.from_stock && (was?.product_id !== it.productId || was?.qty !== it.qty)) await sync(it.id, it.productId, it.qty);
  }
  const removed = [...existingIds.keys()].filter((k) => !keep.has(k));
  for (const itemId of removed) await sync(itemId, null, 0);
  if (removed.length) await ctx.q.query("delete from order_items where id = any($1::int[])", [removed]);

  await logEvent(ctx.q, { userId: ctx.me.id, kind: "edited", orderId: id });
  await notifyLowStock(ctx, [...touched]);
  return respondOrder(ctx, id);
});

route("DELETE", "/api/orders/:id", SALES, async (ctx) => {
  const id = idParam(ctx);
  const current = await lockOrder(ctx.q, id);
  if (current.deleted_at) throw notFound("سفارش پیدا نشد");
  await ctx.q.query("update orders set deleted_at = now(), version = version + 1 where id = $1", [id]);
  // a cancelled order gives back what it took: materials, or finished pieces to the shop
  const items = await ctx.q.query<{ id: number; product_id: number | null; qty: number }>("select id, product_id, qty from order_items where order_id = $1", [id]);
  for (const it of items) {
    if (current.from_stock) await ctx.q.query("update products set ready_stock = ready_stock + $2 where id = $1", [it.product_id, it.qty]);
    else await syncItemStock(ctx.q, { orderId: id, itemId: it.id, productId: it.product_id, qty: 0, userId: ctx.me.id });
  }
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "deleted", orderId: id });
  return { ok: true };
});

route("POST", "/api/orders/:id/restore", SALES, async (ctx) => {
  const id = idParam(ctx);
  const current = await lockOrder(ctx.q, id);
  if (!current.deleted_at) throw conflict("این سفارش حذف نشده");
  const items = await ctx.q.query<{ id: number; product_id: number | null; qty: number }>("select id, product_id, qty from order_items where order_id = $1", [id]);
  for (const it of items) {
    if (current.from_stock && it.product_id) await takeReadyStock(ctx.q, it.product_id, it.qty);
    else if (!current.from_stock) await syncItemStock(ctx.q, { orderId: id, itemId: it.id, productId: it.product_id, qty: it.qty, userId: ctx.me.id });
  }
  await ctx.q.query("update orders set deleted_at = null, version = version + 1 where id = $1", [id]);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "restored", orderId: id });
  return respondOrder(ctx, id);
});

route("POST", "/api/orders/:id/deliver", DELIVERY, async (ctx) => {
  const id = idParam(ctx);
  const delivered = bool(ctx.body.delivered, "وضعیت تحویل");
  const current = await lockOrder(ctx.q, id);
  if (current.deleted_at) throw notFound("سفارش پیدا نشد");
  if (delivered) {
    if (current.delivered_at) throw conflict("این سفارش قبلاً تحویل شده");
    const order = await loadOrder(ctx.q, { id }, false);
    if (!order || !isOrderReady(order)) throw conflict("هنوز همه‌ی اقلام این سفارش آماده نیست");
    await ctx.q.query("update orders set delivered_at = $2, version = version + 1 where id = $1", [id, todayISO()]);
  } else {
    if (!current.delivered_at) throw conflict("این سفارش هنوز تحویل نشده");
    await ctx.q.query("update orders set delivered_at = null, version = version + 1 where id = $1", [id]);
  }
  await logEvent(ctx.q, { userId: ctx.me.id, kind: delivered ? "delivered" : "undelivered", orderId: id });
  return respondOrder(ctx, id);
});

function stageParam(v: unknown, me: User): StageKey {
  const stage = v as StageKey;
  if (!STAGES.includes(stage)) throw bad("مرحله نامعتبره");
  if (!canWorkStage(me.role, stage)) throw new HttpError(403, "فقط مرحله‌ی خودت رو می‌تونی ثبت کنی");
  return stage;
}

// Locks the item's order and checks it's still in production.
async function lockItemOrder(q: Queryable, itemId: number) {
  const rows = await q.query<{ order_id: number }>("select order_id from order_items where id = $1", [itemId]);
  if (!rows[0]) throw notFound("قلم پیدا نشد");
  const order = await lockOrder(q, rows[0].order_id);
  if (order.deleted_at) throw notFound("سفارش پیدا نشد");
  if (order.delivered_at) throw conflict("این سفارش تحویل شده");
  return order;
}

route("POST", "/api/items/:id/stage", "auth", async (ctx) => {
  const itemId = idParam(ctx);
  const stage = stageParam(ctx.body.stage, ctx.me);
  const done = bool(ctx.body.done, "وضعیت");
  const order = await lockItemOrder(ctx.q, itemId);
  // re-read under the order lock so two people can't race on the same item
  const [p] = await ctx.q.query<Production>(`select ${STAGES.join(", ")} from order_items where id = $1`, [itemId]);
  const err = stageChangeError(p, stage, done);
  if (err) throw conflict(err);
  const before = await loadOrder(ctx.q, { id: order.id }, false);
  await ctx.q.query(
    `update order_items set ${stage} = $2, ${stage}_at = case when $2 then now() end, ${stage}_by = case when $2 then $3::int end
      where id = $1`,
    [itemId, done, ctx.me.id]
  );
  if (done) {
    // finishing the stage settles any delay reported on it
    await ctx.q.query(
      "update item_delays set resolved_at = now(), resolved_by = $3 where item_id = $1 and stage = $2 and resolved_at is null",
      [itemId, stage, ctx.me.id]
    );
  }
  await touchOrder(ctx.q, order.id);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: done ? "stage_done" : "stage_undone", orderId: order.id, itemId, stage });
  if (done) {
    const after = await loadOrder(ctx.q, { id: order.id }, false);
    if (after) await notifyOrderProgress(ctx, before, after);
  }
  return respondOrder(ctx, order.id);
});

route("POST", "/api/items/:id/delays", "auth", async (ctx) => {
  const itemId = idParam(ctx);
  const stage = stageParam(ctx.body.stage, ctx.me);
  const reason = ctx.body.reason as DelayReason;
  if (!(reason in DELAY_REASONS)) throw bad("دلیل تأخیر رو انتخاب کن");
  const note = text(ctx.body.note, "توضیح", { max: 1000 });
  if (reason === "other" && !note) throw bad("برای «سایر» یه توضیح کوتاه بنویس");
  const eta = ctx.body.eta ? isoDate(ctx.body.eta, "تاریخ تخمینی") : null;
  const order = await lockItemOrder(ctx.q, itemId);
  const [p] = await ctx.q.query<Production>(`select ${STAGES.join(", ")} from order_items where id = $1`, [itemId]);
  if (p[stage]) throw conflict("این مرحله تمام شده؛ تأخیر معنی نداره");
  // one open delay per item and stage: a new report replaces the old one
  await ctx.q.query(
    "update item_delays set resolved_at = now(), resolved_by = $3 where item_id = $1 and stage = $2 and resolved_at is null",
    [itemId, stage, ctx.me.id]
  );
  await ctx.q.query(
    "insert into item_delays (item_id, stage, reason, note, eta, created_by) values ($1, $2, $3, $4, $5, $6)",
    [itemId, stage, reason, note, eta, ctx.me.id]
  );
  await touchOrder(ctx.q, order.id);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "delay_reported", orderId: order.id, itemId, stage, details: { reason, note, eta } });
  const delayed = await loadOrder(ctx.q, { id: order.id }, false);
  const item = delayed?.items.find((i) => i.id === itemId);
  if (delayed && item) {
    const label = (await stationLabels(ctx.q)).get(stage) ?? stage;
    notify(ctx, { roles: ["workshop", "admin", "store"], exceptUserId: ctx.me.id }, {
      title: `تأخیر در ${label}: ${DELAY_REASONS[reason]}`,
      body: `${item.productName} — ${delayed.customer} (${delayed.code})${note ? ` — ${note}` : ""}`,
      url: `./?order=${delayed.id}`,
      tag: `delay-${itemId}-${stage}`,
    });
  }
  return respondOrder(ctx, order.id);
});

route("POST", "/api/delays/:id/resolve", "auth", async (ctx) => {
  const id = idParam(ctx);
  const rows = await ctx.q.query<{ item_id: number; stage: StageKey; resolved_at: string | null }>(
    "select item_id, stage, resolved_at from item_delays where id = $1",
    [id]
  );
  if (!rows[0]) throw notFound("تأخیر پیدا نشد");
  stageParam(rows[0].stage, ctx.me);
  const order = await lockItemOrder(ctx.q, rows[0].item_id);
  if (rows[0].resolved_at) throw conflict("این تأخیر قبلاً برطرف شده");
  await ctx.q.query("update item_delays set resolved_at = now(), resolved_by = $2 where id = $1", [id, ctx.me.id]);
  await touchOrder(ctx.q, order.id);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "delay_resolved", orderId: order.id, itemId: rows[0].item_id, stage: rows[0].stage });
  return respondOrder(ctx, order.id);
});

// Everything that happened to one order, oldest first.
route("GET", "/api/orders/:id/timeline", "auth", async (ctx) => {
  const id = idParam(ctx);
  const rows = await ctx.q.query<{
    id: number; at: string; kind: string; stage: StageKey | null; item_name: string | null;
    user_name: string | null; details: Record<string, unknown>;
  }>(
    `select e.id, e.at, e.kind, e.stage, i.product_name as item_name, u.display_name as user_name, e.details
       from order_events e
       left join order_items i on i.id = e.item_id
       left join users u on u.id = e.user_id
      where e.order_id = $1
      order by e.at, e.id`,
    [id]
  );
  return {
    events: rows.map((r) => ({
      id: r.id, at: r.at, kind: r.kind, stage: r.stage, orderCode: null, itemName: r.item_name, user: r.user_name, details: r.details,
    })),
  };
});

route("GET", "/api/print/:code", "auth", async (ctx) => {
  const order = await loadOrder(ctx.q, { code: decodeURIComponent(ctx.params[0]) }, false);
  if (!order) throw notFound("سفارش پیدا نشد");
  return { order, stations: await loadStations(ctx.q) };
});

// ---------------------------------------------------------------- customers

async function customerNameClash(q: Queryable, name: string, exceptId: number): Promise<boolean> {
  const key = searchKey(name);
  return (await q.query<{ id: number; name: string }>("select id, name from customers")).some(
    (c) => c.id !== exceptId && searchKey(c.name) === key
  );
}

route("POST", "/api/customers", SALES, async (ctx) => {
  const name = normalizeName(text(ctx.body.name, "نام مشتری", { required: true, max: 120 }));
  if (await customerNameClash(ctx.q, name, 0)) throw conflict("مشتری با این نام وجود داره");
  const rows = await ctx.q.query<{ id: number }>(
    "insert into customers (name, phone, notes) values ($1, $2, $3) on conflict (name) do nothing returning id",
    [name, text(ctx.body.phone, "تلفن", { max: 40 }), text(ctx.body.notes, "توضیحات", { max: 2000 })]
  );
  if (!rows[0]) throw conflict("مشتری با این نام وجود داره");
  return { id: rows[0].id };
});

route("PATCH", "/api/customers/:id", SALES, async (ctx) => {
  const id = idParam(ctx);
  const name = normalizeName(text(ctx.body.name, "نام مشتری", { required: true, max: 120 }));
  if (await customerNameClash(ctx.q, name, id)) throw conflict("مشتری دیگه‌ای با این نام وجود داره");
  const rows = await ctx.q.query(
    "update customers set name = $2, phone = $3, notes = $4 where id = $1 returning id",
    [id, name, text(ctx.body.phone, "تلفن", { max: 40 }), text(ctx.body.notes, "توضیحات", { max: 2000 })]
  );
  if (!rows[0]) throw notFound("مشتری پیدا نشد");
  return { ok: true };
});

// ---------------------------------------------------------------- catalog

async function assertCategory(q: Queryable, id: number) {
  const rows = await q.query("select 1 from categories where id = $1", [id]);
  if (!rows[0]) throw bad("دسته نامعتبره");
}

// A product's recipe. Orders already registered keep what they took.
async function replaceBom(q: Queryable, productId: number, raw: unknown) {
  const lines = array(raw, "مواد لازم", 100).map((l) => {
    const b = asBody(l);
    return { materialId: int(b.materialId, "ماده", { min: 1 }), qty: decimal(b.qty, "مقدار", { min: 0.001, max: 1e6 }) };
  });
  if (new Set(lines.map((l) => l.materialId)).size !== lines.length) throw bad("یه ماده دو بار توی لیست اومده");
  await q.query("delete from product_materials where product_id = $1", [productId]);
  for (const l of lines) {
    const found = await q.query("select 1 from materials where id = $1", [l.materialId]);
    if (!found[0]) throw bad("ماده نامعتبره");
    await q.query("insert into product_materials (product_id, material_id, qty) values ($1, $2, $3)", [productId, l.materialId, l.qty]);
  }
}

route("POST", "/api/products", ADMIN, async (ctx) => {
  const name = text(ctx.body.name, "نام محصول", { required: true, max: 120 });
  const categoryId = int(ctx.body.categoryId, "دسته", { min: 1 });
  const price = int(ctx.body.price, "قیمت", { min: 0, max: 1e15 });
  await assertCategory(ctx.q, categoryId);
  const [{ n }] = await ctx.q.query<{ n: number }>("select count(*)::int as n from products where active");
  if (n >= MAX_PRODUCTS) throw conflict(`حداکثر ${MAX_PRODUCTS} مدل می‌شه داشت`);
  const [row] = await ctx.q.query<{ id: number }>(
    "insert into products (name, category_id, price) values ($1, $2, $3) returning id",
    [name, categoryId, price]
  );
  if (ctx.body.bom !== undefined) await replaceBom(ctx.q, row.id, ctx.body.bom);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "product_added", details: { name, price } });
  return { id: row.id };
});

route("PATCH", "/api/products/:id", ADMIN, async (ctx) => {
  const id = idParam(ctx);
  const [cur] = await ctx.q.query<{ name: string; category_id: number; price: number; active: boolean }>(
    "select name, category_id, price, active from products where id = $1",
    [id]
  );
  if (!cur) throw notFound("محصول پیدا نشد");
  const b = ctx.body;
  const name = b.name === undefined ? cur.name : text(b.name, "نام محصول", { required: true, max: 120 });
  const categoryId = b.categoryId === undefined ? cur.category_id : int(b.categoryId, "دسته", { min: 1 });
  const price = b.price === undefined ? cur.price : int(b.price, "قیمت", { min: 0, max: 1e15 });
  const active = b.active === undefined ? cur.active : bool(b.active, "وضعیت");
  if (categoryId !== cur.category_id) await assertCategory(ctx.q, categoryId);
  if (active && !cur.active) {
    const [{ n }] = await ctx.q.query<{ n: number }>("select count(*)::int as n from products where active");
    if (n >= MAX_PRODUCTS) throw conflict(`حداکثر ${MAX_PRODUCTS} مدل می‌شه داشت`);
  }
  await ctx.q.query("update products set name = $2, category_id = $3, price = $4, active = $5 where id = $1", [
    id, name, categoryId, price, active,
  ]);
  if (b.bom !== undefined) await replaceBom(ctx.q, id, b.bom);
  const kind = active === cur.active ? "product_edited" : active ? "product_restored" : "product_deleted";
  await logEvent(ctx.q, { userId: ctx.me.id, kind, details: { name, price } });
  return { ok: true };
});

route("POST", "/api/categories", ADMIN, async (ctx) => {
  const name = text(ctx.body.name, "نام دسته", { required: true, max: 60 });
  const rows = await ctx.q.query<{ id: number }>(
    `insert into categories (name, sort) values ($1, (select coalesce(max(sort), 0) + 1 from categories))
       on conflict (name) do nothing returning id`,
    [name]
  );
  if (!rows[0]) throw conflict("این دسته وجود داره");
  return { id: rows[0].id };
});

route("PATCH", "/api/categories/:id", ADMIN, async (ctx) => {
  const id = idParam(ctx);
  const name = text(ctx.body.name, "نام دسته", { required: true, max: 60 });
  const clash = await ctx.q.query("select 1 from categories where name = $1 and id <> $2", [name, id]);
  if (clash.length) throw conflict("این دسته وجود داره");
  const rows = await ctx.q.query("update categories set name = $2 where id = $1 returning id", [id, name]);
  if (!rows[0]) throw notFound("دسته پیدا نشد");
  return { ok: true };
});

route("DELETE", "/api/categories/:id", ADMIN, async (ctx) => {
  const id = idParam(ctx);
  const used = await ctx.q.query("select 1 from products where category_id = $1 limit 1", [id]);
  if (used.length) throw conflict("این دسته محصول داره؛ اول محصول‌هاش رو جابه‌جا کن");
  await ctx.q.query("delete from categories where id = $1", [id]);
  return { ok: true };
});

route("PATCH", "/api/stations/:key", ADMIN, async (ctx) => {
  const key = ctx.params[0];
  const label = text(ctx.body.label, "نام ایستگاه", { required: true, max: 40 });
  const capacity = int(ctx.body.capacity, "ظرفیت", { min: 1, max: 999 });
  const rows = await ctx.q.query("update stations set label = $2, capacity = $3 where key = $1 returning key", [
    key, label, capacity,
  ]);
  if (!rows[0]) throw notFound("ایستگاه پیدا نشد");
  return { ok: true };
});

// ---------------------------------------------------------------- users


async function insertUser(q: Queryable, b: Body): Promise<User> {
  const username = text(b.username, "نام کاربری", { required: true, max: 50 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw bad("نام کاربری فقط حروف انگلیسی، عدد و . _ - (حداقل ۳ حرف)");
  const displayName = text(b.displayName, "نام", { required: true, max: 80 });
  const password = text(b.password, "رمز عبور", { required: true, max: 200 });
  if (password.length < 8) throw bad("رمز عبور حداقل ۸ حرف باشه");
  const role = b.role as Role;
  if (!ROLES.includes(role)) throw bad("نقش نامعتبره");
  const rows = await q.query<UserRow>(
    `insert into users (username, display_name, password_hash, role) values ($1, $2, $3, $4)
       on conflict (username) do nothing
     returning id, username, display_name, role, active`,
    [username, displayName, await hashPassword(password), role]
  );
  if (!rows[0]) throw conflict("این نام کاربری گرفته شده");
  return toUser(rows[0]);
}

route("GET", "/api/users", ADMIN, async (ctx) => {
  const rows = await ctx.q.query<UserRow>("select id, username, display_name, role, active from users order by id");
  return { users: rows.map(toUser) };
});

route("POST", "/api/users", ADMIN, async (ctx) => {
  const user = await insertUser(ctx.q, ctx.body);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "user_added", details: { username: user.username, role: user.role } });
  return { user };
});

route("PATCH", "/api/users/:id", ADMIN, async (ctx) => {
  const id = idParam(ctx);
  const [cur] = await ctx.q.query<UserRow>("select id, username, display_name, role, active from users where id = $1", [id]);
  if (!cur) throw notFound("کاربر پیدا نشد");
  const b = ctx.body;
  const displayName = b.displayName === undefined ? cur.display_name : text(b.displayName, "نام", { required: true, max: 80 });
  const role = b.role === undefined ? cur.role : (b.role as Role);
  if (!ROLES.includes(role)) throw bad("نقش نامعتبره");
  const active = b.active === undefined ? cur.active : bool(b.active, "وضعیت");
  if (id === ctx.me.id && (role !== "admin" || !active)) throw conflict("نمی‌تونی دسترسی مدیر خودت رو برداری");
  await ctx.q.query("update users set display_name = $2, role = $3, active = $4 where id = $1", [id, displayName, role, active]);
  if (b.password !== undefined) {
    const password = text(b.password, "رمز عبور", { required: true, max: 200 });
    if (password.length < 8) throw bad("رمز عبور حداقل ۸ حرف باشه");
    await ctx.q.query("update users set password_hash = $2 where id = $1", [id, await hashPassword(password)]);
  }
  // sign the user out everywhere when their access or password changes
  if (b.password !== undefined || !active || role !== cur.role) {
    await ctx.q.query("delete from sessions where user_id = $1", [id]);
  }
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "user_edited", details: { username: cur.username, role, active } });
  return { ok: true };
});

// ---------------------------------------------------------------- audit & reports

route("GET", "/api/audit", ADMIN, async (ctx) => {
  const limit = Math.min(int(ctx.url.searchParams.get("limit") ?? "200", "تعداد", { min: 1 }), 1000);
  const rows = await ctx.q.query<{
    id: number; at: string; kind: string; stage: StageKey | null; order_code: string | null;
    item_name: string | null; user_name: string | null; details: Record<string, unknown>;
  }>(
    `select e.id, e.at, e.kind, e.stage, o.code as order_code, i.product_name as item_name,
            u.display_name as user_name, e.details
       from order_events e
       left join orders o on o.id = e.order_id
       left join order_items i on i.id = e.item_id
       left join users u on u.id = e.user_id
      order by e.id desc limit $1`,
    [limit]
  );
  return {
    events: rows.map((r) => ({
      id: r.id, at: r.at, kind: r.kind, stage: r.stage, orderCode: r.order_code,
      itemName: r.item_name, user: r.user_name, details: r.details,
    })),
  };
});

route("GET", "/api/reports/throughput", SALES, async (ctx) => {
  const from = isoDate(ctx.url.searchParams.get("from"), "از تاریخ");
  const to = isoDate(ctx.url.searchParams.get("to"), "تا تاریخ");
  const rows = await ctx.q.query<{ stage: StageKey; n: number }>(
    `select stage, sum(case when kind = 'stage_done' then 1 else -1 end)::int as n
       from order_events
      where kind in ('stage_done', 'stage_undone')
        and (at at time zone $3)::date between $1 and $2
      group by stage`,
    [from, to, process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Tehran"]
  );
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<StageKey, number>;
  for (const r of rows) byStage[r.stage] = r.n;
  return { byStage };
});

// ---------------------------------------------------------------- warehouse

route("POST", "/api/materials", WAREHOUSE, async (ctx) => {
  const name = normalizeName(text(ctx.body.name, "نام ماده", { required: true, max: 120 }));
  const unit = text(ctx.body.unit, "واحد", { required: true, max: 20 });
  const stock = decimal(ctx.body.stock ?? 0, "موجودی");
  const minStock = decimal(ctx.body.minStock ?? 0, "حداقل موجودی");
  const rows = await ctx.q.query<{ id: number }>(
    "insert into materials (name, unit, min_stock) values ($1, $2, $3) on conflict (name) do nothing returning id",
    [name, unit, minStock]
  );
  if (!rows[0]) throw conflict("این ماده توی لیست هست");
  if (stock > 0) await moveStock(ctx.q, { materialId: rows[0].id, delta: stock, kind: "adjust", note: "موجودی اولیه", userId: ctx.me.id });
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "material_added", details: { name } });
  return { id: rows[0].id };
});

route("PATCH", "/api/materials/:id", WAREHOUSE, async (ctx) => {
  const id = idParam(ctx);
  const [cur] = await ctx.q.query<{ name: string; unit: string; min_stock: number; active: boolean }>("select name, unit, min_stock, active from materials where id = $1", [id]);
  if (!cur) throw notFound("ماده پیدا نشد");
  const b = ctx.body;
  const name = b.name === undefined ? cur.name : normalizeName(text(b.name, "نام ماده", { required: true, max: 120 }));
  const clash = await ctx.q.query("select 1 from materials where name = $1 and id <> $2", [name, id]);
  if (clash.length) throw conflict("این ماده توی لیست هست");
  await ctx.q.query("update materials set name = $2, unit = $3, min_stock = $4, active = $5 where id = $1", [
    id,
    name,
    b.unit === undefined ? cur.unit : text(b.unit, "واحد", { required: true, max: 20 }),
    b.minStock === undefined ? cur.min_stock : decimal(b.minStock, "حداقل موجودی"),
    b.active === undefined ? cur.active : bool(b.active, "وضعیت"),
  ]);
  return { ok: true };
});

// Goods received (purchase: qty added) or a stock count (adjust: setTo is what's really there).
route("POST", "/api/materials/:id/stock", WAREHOUSE, async (ctx) => {
  const id = idParam(ctx);
  const [cur] = await ctx.q.query<{ stock: number; name: string }>("select stock, name from materials where id = $1 for update", [id]);
  if (!cur) throw notFound("ماده پیدا نشد");
  const note = text(ctx.body.note, "توضیح", { max: 300 });
  if (ctx.body.kind === "purchase") {
    await moveStock(ctx.q, { materialId: id, delta: decimal(ctx.body.qty, "مقدار", { min: 0.001 }), kind: "purchase", note, userId: ctx.me.id });
  } else if (ctx.body.kind === "adjust") {
    const delta = Math.round((decimal(ctx.body.setTo, "موجودی واقعی") - cur.stock) * 1000) / 1000;
    if (delta !== 0) await moveStock(ctx.q, { materialId: id, delta, kind: "adjust", note, userId: ctx.me.id });
  } else throw bad("نوع تغییر نامعتبره");
  return { ok: true };
});

route("GET", "/api/materials/:id/movements", OFFICE, async (ctx) => {
  const rows = await ctx.q.query<{ id: number; delta: number; kind: "purchase"; note: string; at: string; code: string | null; user_name: string | null }>(
    `select m.id, m.delta, m.kind, m.note, m.at, o.code, u.display_name as user_name
       from stock_movements m
       left join orders o on o.id = m.order_id
       left join users u on u.id = m.user_id
      where m.material_id = $1
      order by m.id desc limit 200`,
    [idParam(ctx)]
  );
  return { movements: rows.map((r) => ({ id: r.id, delta: r.delta, kind: r.kind, note: r.note, at: r.at, orderCode: r.code, user: r.user_name })) };
});

// Finished pieces in the shop: built for stock (+) or counted / taken out (-).
route("POST", "/api/products/:id/ready", OFFICE, async (ctx) => {
  const id = idParam(ctx);
  const delta = int(ctx.body.delta, "تعداد", { min: -100000, max: 100000 });
  const rows = await ctx.q.query<{ name: string; ready_stock: number }>(
    "update products set ready_stock = ready_stock + $2 where id = $1 and ready_stock + $2 >= 0 returning name, ready_stock",
    [id, delta]
  );
  if (!rows[0]) throw conflict("موجودی آماده نمی‌تونه منفی بشه");
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "ready_stock_changed", details: { name: rows[0].name, delta, stock: rows[0].ready_stock } });
  return { readyStock: rows[0].ready_stock };
});

// ---------------------------------------------------------------- fabric and wood lists

const parseOptionKind = (v: unknown): OptionKind => {
  if (v !== "fabric" && v !== "wood") throw bad("نوع نامعتبره");
  return v;
};

route("POST", "/api/options", OFFICE, async (ctx) => {
  const kind = parseOptionKind(ctx.body.kind);
  const name = normalizeName(text(ctx.body.name, "نام", { required: true, max: 100 }));
  // adding a name that was removed earlier brings it back
  const rows = await ctx.q.query<{ id: number }>(
    `insert into catalog_options (kind, name) values ($1, $2)
       on conflict (kind, name) do update set active = true where not catalog_options.active
     returning id`,
    [kind, name]
  );
  if (!rows[0]) throw conflict("این مورد توی لیست هست");
  return { id: rows[0].id };
});

route("PATCH", "/api/options/:id", OFFICE, async (ctx) => {
  const id = idParam(ctx);
  const [cur] = await ctx.q.query<{ kind: OptionKind; name: string; active: boolean }>("select kind, name, active from catalog_options where id = $1", [id]);
  if (!cur) throw notFound("پیدا نشد");
  const name = ctx.body.name === undefined ? cur.name : normalizeName(text(ctx.body.name, "نام", { required: true, max: 100 }));
  const clash = await ctx.q.query("select 1 from catalog_options where kind = $1 and name = $2 and id <> $3", [cur.kind, name, id]);
  if (clash.length) throw conflict("این مورد توی لیست هست");
  // past orders keep the text they were sold with
  await ctx.q.query("update catalog_options set name = $2, active = $3 where id = $1", [
    id,
    name,
    ctx.body.active === undefined ? cur.active : bool(ctx.body.active, "وضعیت"),
  ]);
  return { ok: true };
});

// ---------------------------------------------------------------- payments

route("POST", "/api/orders/:id/payments", SALES, async (ctx) => {
  const id = idParam(ctx);
  const current = await lockOrder(ctx.q, id);
  if (current.deleted_at) throw notFound("سفارش پیدا نشد");
  const paymentId = await addPayment(ctx, id, paymentFields(ctx.body));
  return { id: paymentId };
});

async function setPaymentVoid(ctx: Ctx, voided: boolean) {
  const id = idParam(ctx);
  const [p] = await ctx.q.query<{ order_id: number; amount: number; voided_at: string | null }>("select order_id, amount, voided_at from payments where id = $1", [id]);
  if (!p) throw notFound("پرداخت پیدا نشد");
  await lockOrder(ctx.q, p.order_id);
  if (Boolean(p.voided_at) === voided) throw conflict(voided ? "این پرداخت قبلاً باطل شده" : "این پرداخت باطل نشده");
  await ctx.q.query(`update payments set voided_at = ${voided ? "now()" : "null"} where id = $1`, [id]);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: voided ? "payment_voided" : "payment_restored", orderId: p.order_id, details: { amount: p.amount } });
  return { ok: true };
}

route("POST", "/api/payments/:id/void", SALES, (ctx) => setPaymentVoid(ctx, true));
route("POST", "/api/payments/:id/restore", SALES, (ctx) => setPaymentVoid(ctx, false));

// ---------------------------------------------------------------- feedback

const FEEDBACK_KINDS = ["bug", "idea", "other"];

route("POST", "/api/feedback", "auth", async (ctx) => {
  const kind = String(ctx.body.kind);
  if (!FEEDBACK_KINDS.includes(kind)) throw bad("نوع بازخورد نامعتبره");
  const body = text(ctx.body.body, "متن بازخورد", { required: true, max: 4000 });
  const page = text(ctx.body.page, "صفحه", { max: 40 });
  await ctx.q.query("insert into feedback (user_id, kind, body, page) values ($1, $2, $3, $4)", [ctx.me.id, kind, body, page]);
  return { ok: true };
});

route("GET", "/api/feedback", ADMIN, async (ctx) => {
  const rows = await ctx.q.query<{
    id: number; kind: string; body: string; page: string; done: boolean; created_at: string; user_name: string | null; role: Role | null;
  }>(
    `select f.id, f.kind, f.body, f.page, f.done, f.created_at, u.display_name as user_name, u.role
       from feedback f left join users u on u.id = f.user_id
      order by f.done, f.id desc limit 500`
  );
  return {
    feedback: rows.map((r) => ({
      id: r.id, kind: r.kind, body: r.body, page: r.page, done: r.done, at: r.created_at, user: r.user_name, role: r.role,
    })),
  };
});

route("PATCH", "/api/feedback/:id", ADMIN, async (ctx) => {
  const rows = await ctx.q.query("update feedback set done = $2 where id = $1 returning id", [idParam(ctx), bool(ctx.body.done, "وضعیت")]);
  if (!rows[0]) throw notFound("بازخورد پیدا نشد");
  return { ok: true };
});

// ---------------------------------------------------------------- push notifications

function pushService() {
  const service = getPushService();
  if (!service) throw new HttpError(501, "اعلان‌ها توی این نسخه فعال نیست");
  return service;
}

route("GET", "/api/push/key", "auth", async (ctx) => ({ publicKey: await pushService().publicKey(ctx.q) }));

route("POST", "/api/push/subscribe", "auth", async (ctx) => {
  pushService();
  const endpoint = text(ctx.body.endpoint, "endpoint", { required: true, max: 2000 });
  if (!/^https:\/\//.test(endpoint)) throw bad("endpoint نامعتبره");
  const keys = asBody(ctx.body.keys);
  const p256dh = text(keys.p256dh, "p256dh", { required: true, max: 200 });
  const auth = text(keys.auth, "auth", { required: true, max: 100 });
  // an endpoint belongs to one device; if someone else logs in there, it moves to them
  await ctx.q.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [ctx.me.id, endpoint, p256dh, auth, (ctx.req.headers.get("user-agent") ?? "").slice(0, 300)]
  );
  return { ok: true };
});

route("POST", "/api/push/unsubscribe", "auth", async (ctx) => {
  const endpoint = text(ctx.body.endpoint, "endpoint", { required: true, max: 2000 });
  await ctx.q.query("delete from push_subscriptions where endpoint = $1 and user_id = $2", [endpoint, ctx.me.id]);
  return { ok: true };
});

route("POST", "/api/push/test", "auth", async (ctx) => {
  pushService();
  const [{ n }] = await ctx.q.query<{ n: number }>("select count(*)::int as n from push_subscriptions where user_id = $1", [ctx.me.id]);
  if (n === 0) throw conflict("اول اعلان‌ها رو روی این دستگاه روشن کن");
  notify(ctx, { userIds: [ctx.me.id] }, { title: "اعلان‌های میزان روشنه ✓", body: "از این به بعد کارهای مربوط به تو همین‌جا خبر داده می‌شه.", tag: "test" });
  return { ok: true, devices: n };
});

// ---------------------------------------------------------------- dispatch

function errorResponse(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function handle(req: Request, opts: HandleOptions = {}): Promise<Response> {
  const url = new URL(req.url);
  const matches = routes.filter((r) => r.pattern.test(url.pathname));
  const r = matches.find((m) => m.method === req.method);
  if (!r) return errorResponse(matches.length ? 405 : 404, "مسیر نامعتبره");

  // Mutations must come from our own page (blocks cross-site form posts).
  if (req.method !== "GET" && req.headers.get("x-mizan") !== "1") return errorResponse(403, "درخواست نامعتبره");

  try {
    const db = await getDb();
    const token =
      opts.session === "header"
        ? req.headers.get("x-mizan-session") ?? undefined
        : readCookie(req.headers.get("cookie"), SESSION_COOKIE);
    const session = await userForSession(db, token);
    const me = session?.user ?? null;
    if (r.access !== "public") {
      if (!me) return errorResponse(401, "اول وارد شو");
      if (r.access !== "auth" && !r.access.includes(me.role)) return errorResponse(403, "به این بخش دسترسی نداری");
    }
    let body: Body = {};
    if (req.method !== "GET") {
      const raw = await req.text();
      body = raw ? asBody(JSON.parse(raw)) : {};
    }
    const params = url.pathname.match(r.pattern)!.slice(1);
    const after: (() => Promise<void>)[] = [];
    const run = (q: Queryable) => r.handler({ req, url, q, me: me as User, body, params, token, opts, after });
    const result =
      req.method === "GET"
        ? await run(db)
        : await db.tx(async (q) => {
            const out = await run(q);
            await bumpVersion(q);
            return out;
          });
    const response = result instanceof Response ? result : Response.json(result);
    if (after.length) {
      // sent before responding (serverless hosts may stop work after the response), capped so a slow push service can't stall the app
      const work = Promise.allSettled(after.map((fn) => fn()));
      await Promise.race([work, new Promise((r) => setTimeout(r, 6000))]);
    }
    if (session?.renewed && opts.session !== "header" && token && !response.headers.has("set-cookie")) {
      response.headers.append("set-cookie", sessionCookie(token, isSecure(req)));
    }
    return response;
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e.status, e.message);
    if (e instanceof SyntaxError) return errorResponse(400, "درخواست نامعتبره");
    console.error(e);
    return errorResponse(500, "خطای سرور — دوباره امتحان کن");
  }
}
