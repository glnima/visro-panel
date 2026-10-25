import { addDays, todayISO } from "@/lib/dates";
import { fullProduction, isOrderReady, stageChangeError } from "@/lib/production";
import { MAX_PRODUCTS, STAGES, type Production, type Role, type StageKey, type User } from "@/lib/types";
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

type Ctx = {
  req: Request;
  url: URL;
  q: Queryable;
  me: User;
  body: Body;
  params: string[];
};

type Access = "public" | "auth" | Role[];
type Handler = (ctx: Ctx) => Promise<unknown>;
type Route = { method: string; pattern: RegExp; access: Access; handler: Handler };

const routes: Route[] = [];
const route = (method: string, path: string, access: Access, handler: Handler) => {
  const pattern = new RegExp("^" + path.replace(/:[a-z]+/g, "([^/]+)") + "$");
  routes.push({ method, pattern, access, handler });
};

const ALL: Role[] = ["admin", "store", "workshop"];
const SALES: Role[] = ["admin", "store"];
const SHOP_FLOOR: Role[] = ["admin", "workshop"];
const ADMIN: Role[] = ["admin"];

const idParam = (ctx: Ctx, i = 0) => int(ctx.params[i], "شناسه", { min: 1 });

// ---------------------------------------------------------------- auth

route("GET", "/api/health", "public", async () => ({ ok: true }));

route("GET", "/api/session", "public", async (ctx) => {
  const users = await ctx.q.query<{ n: number }>("select count(*)::int as n from users");
  return { me: ctx.me ?? null, needsSetup: users[0].n === 0 };
});

function withSession(req: Request, token: string, payload: unknown): Response {
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return Response.json(payload, { headers: { "set-cookie": sessionCookie(token, secure) } });
}

route("POST", "/api/setup", "public", async (ctx) => {
  const users = await ctx.q.query<{ n: number }>("select count(*)::int as n from users");
  if (users[0].n > 0) throw conflict("حساب مدیر قبلاً ساخته شده");
  const user = await insertUser(ctx.q, { ...ctx.body, role: "admin" });
  const token = await createSession(ctx.q, user.id);
  return withSession(ctx.req, token, { me: user });
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
  return withSession(ctx.req, token, { me: toUser(row) });
});

route("POST", "/api/logout", "public", async (ctx) => {
  await deleteSession(ctx.q, readCookie(ctx.req.headers.get("cookie"), SESSION_COOKIE));
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

async function findOrCreateCustomer(q: Queryable, name: string): Promise<number> {
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

async function insertItem(q: Queryable, orderId: number, position: number, it: ItemInput, production: Production) {
  const snap = await productSnapshot(q, it.productId);
  await q.query(
    `insert into order_items (order_id, position, product_id, product_name, unit_price, qty, fabric_color, wood_color,
                              ${STAGES.join(", ")})
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [orderId, position, it.productId, snap.name, snap.price, it.qty, it.fabricColor, it.woodColor, ...stageCols(production)]
  );
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
  const ready = ctx.body.ready === true;
  const customerId = await findOrCreateCustomer(ctx.q, f.customer);
  const [row] = await ctx.q.query<{ id: number }>(
    `insert into orders (code, customer_id, order_date, requested, notes, created_by)
     values ('SF-' || nextval('order_code_seq'), $1, $2, $3, $4, $5) returning id`,
    [customerId, f.orderDate, f.requested, f.notes, ctx.me.id]
  );
  const production = ready ? fullProduction() : { carpentry: false, zirkar: false, rangkar: false, tailor: false, ruyekoob: false };
  for (const [i, it] of f.items.entries()) await insertItem(ctx.q, row.id, i, it, production);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "created", orderId: row.id, details: { ready } });
  return respondOrder(ctx, row.id);
});

async function lockOrder(q: Queryable, id: number) {
  const rows = await q.query<{ id: number; version: number; delivered_at: string | null; deleted_at: string | null }>(
    "select id, version, delivered_at, deleted_at from orders where id = $1 for update",
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
  for (const [i, it] of f.items.entries()) {
    if (it.id === null) {
      await insertItem(ctx.q, id, i, it, { carpentry: false, zirkar: false, rangkar: false, tailor: false, ruyekoob: false });
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
  }
  const removed = [...existingIds.keys()].filter((k) => !keep.has(k));
  if (removed.length) await ctx.q.query("delete from order_items where id = any($1::int[])", [removed]);

  await logEvent(ctx.q, { userId: ctx.me.id, kind: "edited", orderId: id });
  return respondOrder(ctx, id);
});

route("DELETE", "/api/orders/:id", SALES, async (ctx) => {
  const id = idParam(ctx);
  const current = await lockOrder(ctx.q, id);
  if (current.deleted_at) throw notFound("سفارش پیدا نشد");
  await ctx.q.query("update orders set deleted_at = now(), version = version + 1 where id = $1", [id]);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "deleted", orderId: id });
  return { ok: true };
});

route("POST", "/api/orders/:id/restore", SALES, async (ctx) => {
  const id = idParam(ctx);
  await lockOrder(ctx.q, id);
  await ctx.q.query("update orders set deleted_at = null, version = version + 1 where id = $1", [id]);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: "restored", orderId: id });
  return respondOrder(ctx, id);
});

route("POST", "/api/orders/:id/deliver", ALL, async (ctx) => {
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

route("POST", "/api/items/:id/stage", SHOP_FLOOR, async (ctx) => {
  const itemId = idParam(ctx);
  const stage = ctx.body.stage as StageKey;
  if (!STAGES.includes(stage)) throw bad("مرحله نامعتبره");
  const done = bool(ctx.body.done, "وضعیت");
  const rows = await ctx.q.query<{ order_id: number } & Production>(
    `select order_id, ${STAGES.join(", ")} from order_items where id = $1`,
    [itemId]
  );
  if (!rows[0]) throw notFound("قلم پیدا نشد");
  const order = await lockOrder(ctx.q, rows[0].order_id);
  if (order.deleted_at) throw notFound("سفارش پیدا نشد");
  if (order.delivered_at) throw conflict("این سفارش تحویل شده");
  // re-read under the order lock so two people can't race on the same item
  const [p] = await ctx.q.query<Production>(`select ${STAGES.join(", ")} from order_items where id = $1`, [itemId]);
  const err = stageChangeError(p, stage, done);
  if (err) throw conflict(err);
  await ctx.q.query(`update order_items set ${stage} = $2 where id = $1`, [itemId, done]);
  await touchOrder(ctx.q, order.id);
  await logEvent(ctx.q, { userId: ctx.me.id, kind: done ? "stage_done" : "stage_undone", orderId: order.id, itemId, stage });
  return respondOrder(ctx, order.id);
});

route("GET", "/api/print/:code", ALL, async (ctx) => {
  const order = await loadOrder(ctx.q, { code: decodeURIComponent(ctx.params[0]) }, false);
  if (!order) throw notFound("سفارش پیدا نشد");
  return { order, stations: await loadStations(ctx.q) };
});

// ---------------------------------------------------------------- customers

route("POST", "/api/customers", SALES, async (ctx) => {
  const name = text(ctx.body.name, "نام مشتری", { required: true, max: 120 });
  const rows = await ctx.q.query<{ id: number }>(
    "insert into customers (name, phone, notes) values ($1, $2, $3) on conflict (name) do nothing returning id",
    [name, text(ctx.body.phone, "تلفن", { max: 40 }), text(ctx.body.notes, "توضیحات", { max: 2000 })]
  );
  if (!rows[0]) throw conflict("مشتری با این نام وجود داره");
  return { id: rows[0].id };
});

route("PATCH", "/api/customers/:id", SALES, async (ctx) => {
  const id = idParam(ctx);
  const name = text(ctx.body.name, "نام مشتری", { required: true, max: 120 });
  const clash = await ctx.q.query("select 1 from customers where name = $1 and id <> $2", [name, id]);
  if (clash.length) throw conflict("مشتری دیگه‌ای با این نام وجود داره");
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

const ROLES: Role[] = ["admin", "store", "workshop"];

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

// ---------------------------------------------------------------- dispatch

function errorResponse(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const matches = routes.filter((r) => r.pattern.test(url.pathname));
  const r = matches.find((m) => m.method === req.method);
  if (!r) return errorResponse(matches.length ? 405 : 404, "مسیر نامعتبره");

  // Mutations must come from our own page (blocks cross-site form posts).
  if (req.method !== "GET" && req.headers.get("x-mizan") !== "1") return errorResponse(403, "درخواست نامعتبره");

  try {
    const db = await getDb();
    const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
    const me = await userForSession(db, token);
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
    const run = (q: Queryable) => r.handler({ req, url, q, me: me as User, body, params });
    const result =
      req.method === "GET"
        ? await run(db)
        : await db.tx(async (q) => {
            const out = await run(q);
            await bumpVersion(q);
            return out;
          });
    return result instanceof Response ? result : Response.json(result);
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e.status, e.message);
    if (e instanceof SyntaxError) return errorResponse(400, "درخواست نامعتبره");
    console.error(e);
    return errorResponse(500, "خطای سرور — دوباره امتحان کن");
  }
}
