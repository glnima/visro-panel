import { MIGRATIONS } from "./migrations";

// One tiny query interface over two drivers:
//  - DATABASE_URL set   → real Postgres via `pg` (production, Railway/Vercel/...)
//  - DATABASE_URL unset → embedded Postgres via PGlite in ./.data (local dev, tests)

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
const parseDate = (v: string) => v;
const parseTimestamp = (v: string) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();
const parseInt8 = (v: string) => Number(v);
const OID = { int8: 20, date: 1082, timestamptz: 1184 };

export async function createPgDb(url: string): Promise<Db> {
  const pg = await import("pg");
  const types = pg.default.types;
  types.setTypeParser(OID.int8, parseInt8);
  types.setTypeParser(OID.date, parseDate);
  types.setTypeParser(OID.timestamptz, parseTimestamp);
  const pool = new pg.default.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE || 5) });
  return {
    async query(sql, params) {
      return (await pool.query(sql, params)).rows;
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({ query: async (sql, params) => (await client.query(sql, params)).rows });
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// PGlite files must only be opened by one process at a time, so a second
// process (e.g. `npm run db:seed` while `npm run dev` runs) fails loudly.
async function lockDataDir(dataDir: string): Promise<void> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const path = `${dataDir}.lock`;
  const pid = Number(await readFile(path, "utf8").catch(() => "0"));
  if (pid && pid !== process.pid) {
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (alive) {
      throw new Error(`The local database is in use by another process (pid ${pid}). Stop "npm run dev" / "npm start" first.`);
    }
  }
  await writeFile(path, String(process.pid));
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
    await lockDataDir(dataDir);
  }
  const db = await PGlite.create(dataDir, {
    parsers: {
      [OID.int8]: (v: string) => parseInt8(v),
      [OID.date]: (v: string) => parseDate(v),
      [OID.timestamptz]: (v: string) => parseTimestamp(v),
    },
  });
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

const g = globalThis as unknown as { __mizanDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__mizanDb) {
    g.__mizanDb = (async () => {
      const url = process.env.DATABASE_URL;
      const cloud = ["VERCEL", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_NAME", "RENDER", "FLY_APP_NAME"].find((k) => process.env[k]);
      if (!url && cloud) {
        // Cloud disks are wiped on redeploy; never silently store real orders there.
        throw new Error(`DATABASE_URL is not set (running on ${cloud}). Attach a Postgres database and set DATABASE_URL.`);
      }
      const db = url ? await createPgDb(url) : await createPgliteDb(process.env.PGLITE_DIR || "./.data/pglite");
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
