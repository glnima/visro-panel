import { MIGRATIONS } from "./migrations";

// One tiny query interface over the drivers. This module is runtime-neutral;
// the drivers themselves are registered by:
//  - db-node.ts → `pg` when DATABASE_URL is set, else PGlite files in ./.data (server, scripts)
//  - demo/      → PGlite in IndexedDB (GitHub Pages demo, runs in the browser)

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Dates come back as "yyyy-mm-dd", timestamps as ISO strings and int8 as numbers,
// whichever driver is in use.
export const parseDate = (v: string) => v;
export const parseTimestamp = (v: string) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
export const parseInt8 = (v: string) => Number(v);
export const OID = { int8: 20, date: 1082, timestamptz: 1184 };

export const PGLITE_PARSERS = {
  [OID.int8]: (v: string) => parseInt8(v),
  [OID.date]: (v: string) => parseDate(v),
  [OID.timestamptz]: (v: string) => parseTimestamp(v),
};

type PgliteLike = {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  transaction<T>(fn: (tx: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> }) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

// Wraps a PGlite instance (from Node or the browser) in our Db interface.
export function wrapPglite(db: PgliteLike): Db {
  // PGlite is a single connection, so serialise transactions ourselves.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    async query(sql, params) {
      return (await db.query(sql, params)).rows as never;
    },
    tx(fn) {
      const run = chain.then(() =>
        db.transaction(async (t) => fn({ query: async (sql, params) => (await t.query(sql, params)).rows as never }))
      );
      chain = run.catch(() => {});
      return run;
    },
    close: () => db.close(),
  };
}

export async function migrate(db: Db): Promise<void> {
  await db.tx(async (q) => {
    await q.query("select pg_advisory_xact_lock(727274)");
    await q.query("create table if not exists schema_migrations (id int primary key, applied_at timestamptz not null default now())");
    const done = new Set((await q.query<{ id: number }>("select id from schema_migrations")).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      for (const stmt of m.sql) await q.query(stmt);
      await q.query("insert into schema_migrations (id) values ($1)", [m.id]);
    }
  });
}

type Factory = () => Promise<Db>;
const g = globalThis as unknown as { __mizanDb?: Promise<Db>; __mizanDbFactory?: Factory };

export function setDbFactory(factory: Factory) {
  g.__mizanDbFactory = factory;
}

export function getDb(): Promise<Db> {
  if (!g.__mizanDb) {
    const factory = g.__mizanDbFactory;
    if (!factory) return Promise.reject(new Error("No database driver registered"));
    g.__mizanDb = (async () => {
      const db = await factory();
      await migrate(db);
      return db;
    })();
    g.__mizanDb.catch(() => {
      g.__mizanDb = undefined;
    });
  }
  return g.__mizanDb;
}

// Tests swap in an in-memory database.
export function setDbForTests(db: Db | undefined) {
  g.__mizanDb = db ? Promise.resolve(db) : undefined;
}
