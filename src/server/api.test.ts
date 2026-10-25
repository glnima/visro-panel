import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Bootstrap, Order } from "@/lib/types";
import { handle } from "./api";
import { createPgDb, createPgliteDb, migrate, setDbForTests, type Db } from "./db";
import { seedDemo } from "./seed";

let db: Db;
const cookies: Record<string, string> = {};

async function call(who: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "x-mizan": "1" };
  if (who && cookies[who]) headers.cookie = cookies[who];
  const res = await handle(
    new Request("http://test" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  );
  const setCookie = res.headers.get("set-cookie");
  if (who && setCookie) cookies[who] = setCookie.split(";")[0];
  return { status: res.status, data: await res.json() };
}

const login = (who: string) => call(who, "POST", "/api/login", { username: who, password: "demo1234" });
const boot = async (who: string) => (await call(who, "GET", "/api/bootstrap")).data as Bootstrap;

// Runs against in-memory PGlite by default; set TEST_DATABASE_URL to run the
// same suite through the `pg` driver against a real (empty) Postgres.
beforeAll(async () => {
  db = process.env.TEST_DATABASE_URL ? await createPgDb(process.env.TEST_DATABASE_URL) : await createPgliteDb();
  await migrate(db);
  setDbForTests(db);
  await seedDemo(db, { withDemoUsers: true });
  for (const who of ["admin", "store", "workshop"]) expect((await login(who)).status).toBe(200);
});

afterAll(async () => {
  setDbForTests(undefined);
  await db.close();
});

describe("auth", () => {
  it("rejects anonymous access", async () => {
    expect((await call(null, "GET", "/api/bootstrap")).status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    expect((await call("x", "POST", "/api/login", { username: "admin", password: "nope" })).status).toBe(401);
  });

  it("refuses setup once users exist", async () => {
    const r = await call("x", "POST", "/api/setup", { username: "boss", displayName: "B", password: "longenough" });
    expect(r.status).toBe(409);
  });

  it("requires the x-mizan header on mutations", async () => {
    const res = await handle(new Request("http://test/api/logout", { method: "POST", headers: { cookie: cookies.admin } }));
    expect(res.status).toBe(403);
  });
});

describe("roles and prices", () => {
  it("hides prices and customers from the workshop", async () => {
    const b = await boot("workshop");
    expect(b.products.every((p) => p.price === null)).toBe(true);
    expect(b.orders.flatMap((o) => o.items).every((i) => i.unitPrice === null)).toBe(true);
    expect(b.customers).toEqual([]);
  });

  it("shows prices to the store", async () => {
    const b = await boot("store");
    expect(b.products[0].price).toBeGreaterThan(0);
  });

  it("keeps the workshop out of sales and admin endpoints", async () => {
    expect((await call("workshop", "POST", "/api/orders", {})).status).toBe(403);
    expect((await call("store", "POST", "/api/products", {})).status).toBe(403);
    expect((await call("store", "GET", "/api/users")).status).toBe(403);
  });
});

describe("orders", () => {
  let order: Order;

  it("creates an order with a server-generated code and price snapshot", async () => {
    const b = await boot("store");
    const r = await call("store", "POST", "/api/orders", {
      customer: "مشتری تازه",
      orderDate: "2026-10-20",
      requested: "2026-11-05",
      items: [{ productId: b.products[0].id, qty: 2, fabricColor: "سبز", woodColor: "" }],
    });
    expect(r.status).toBe(200);
    order = r.data.order;
    expect(order.code).toMatch(/^SF-\d+$/);
    expect(order.items[0].unitPrice).toBe(b.products[0].price);
    const codes = (await boot("store")).orders.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("enforces the stage order", async () => {
    const item = order.items[0].id;
    const early = await call("workshop", "POST", `/api/items/${item}/stage`, { stage: "zirkar", done: true });
    expect(early.status).toBe(409);
    expect((await call("workshop", "POST", `/api/items/${item}/stage`, { stage: "carpentry", done: true })).status).toBe(200);
    const undo = await call("workshop", "POST", `/api/items/${item}/stage`, { stage: "carpentry", done: false });
    expect(undo.status).toBe(200);
    expect(undo.data.order.items[0].production.carpentry).toBe(false);
  });

  it("rejects an edit made from a stale copy", async () => {
    const r = await call("store", "PATCH", `/api/orders/${order.id}`, {
      version: order.version,
      customer: order.customer,
      orderDate: order.orderDate,
      requested: order.requested,
      items: order.items.map((i) => ({ id: i.id, productId: i.productId, qty: 1 })),
    });
    expect(r.status).toBe(409);
  });

  it("edits with the current version and keeps production progress", async () => {
    const fresh = (await boot("store")).orders.find((o) => o.id === order.id)!;
    await call("workshop", "POST", `/api/items/${fresh.items[0].id}/stage`, { stage: "tailor", done: true });
    const latest = (await boot("store")).orders.find((o) => o.id === order.id)!;
    const r = await call("store", "PATCH", `/api/orders/${order.id}`, {
      version: latest.version,
      customer: "مشتری تازه",
      orderDate: latest.orderDate,
      requested: latest.requested,
      notes: "یادداشت",
      items: latest.items.map((i) => ({ id: i.id, productId: i.productId, qty: 3, fabricColor: i.fabricColor, woodColor: i.woodColor })),
    });
    expect(r.status).toBe(200);
    expect(r.data.order.items[0].qty).toBe(3);
    expect(r.data.order.items[0].production.tailor).toBe(true);
  });

  it("only delivers when every item is finished", async () => {
    expect((await call("workshop", "POST", `/api/orders/${order.id}/deliver`, { delivered: true })).status).toBe(409);
    const item = order.items[0].id;
    for (const stage of ["carpentry", "zirkar", "rangkar", "ruyekoob"]) {
      expect((await call("workshop", "POST", `/api/items/${item}/stage`, { stage, done: true })).status).toBe(200);
    }
    const r = await call("workshop", "POST", `/api/orders/${order.id}/deliver`, { delivered: true });
    expect(r.status).toBe(200);
    expect(r.data.order.deliveredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("soft-deletes and restores", async () => {
    expect((await call("store", "DELETE", `/api/orders/${order.id}`)).status).toBe(200);
    expect((await boot("store")).orders.some((o) => o.id === order.id)).toBe(false);
    expect((await call("store", "POST", `/api/orders/${order.id}/restore`)).status).toBe(200);
    expect((await boot("store")).orders.some((o) => o.id === order.id)).toBe(true);
  });

  it("records who did what", async () => {
    const r = await call("admin", "GET", "/api/audit?limit=50");
    const kinds = r.data.events.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["created", "edited", "stage_done", "stage_undone", "delivered", "deleted", "restored"]));
    expect(r.data.events[0].user).toBeTruthy();
  });

  it("bumps the change version on every write", async () => {
    const before = (await call("store", "GET", "/api/version")).data.version;
    await call("store", "POST", "/api/customers", { name: "مشتری نسخه" });
    expect((await call("store", "GET", "/api/version")).data.version).toBe(before + 1);
  });
});

describe("admin", () => {
  it("stops an admin from locking themselves out", async () => {
    const me = (await boot("admin")).me;
    expect((await call("admin", "PATCH", `/api/users/${me.id}`, { role: "store" })).status).toBe(409);
  });

  it("signs a user out when deactivated", async () => {
    const created = await call("admin", "POST", "/api/users", {
      username: "temp", displayName: "موقت", password: "password1", role: "store",
    });
    expect(created.status).toBe(200);
    expect((await call("temp", "POST", "/api/login", { username: "temp", password: "password1" })).status).toBe(200);
    await call("admin", "PATCH", `/api/users/${created.data.user.id}`, { active: false });
    expect((await call("temp", "GET", "/api/bootstrap")).status).toBe(401);
  });

  it("updates station capacity", async () => {
    expect((await call("admin", "PATCH", "/api/stations/carpentry", { label: "نجاری", capacity: 9 })).status).toBe(200);
    expect((await boot("admin")).stations.find((s) => s.key === "carpentry")!.capacity).toBe(9);
  });

  it("refuses to delete a category that has products", async () => {
    const b = await boot("admin");
    expect((await call("admin", "DELETE", `/api/categories/${b.products[0].categoryId}`)).status).toBe(409);
  });
});
