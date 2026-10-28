import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { OID, PGLITE_PARSERS, parseDate, parseInt8, parseTimestamp, setDbFactory, wrapPglite, type Db } from "./db";

// Node drivers: real Postgres when DATABASE_URL is set, otherwise PGlite files.

export async function createPgDb(url: string): Promise<Db> {
  pg.types.setTypeParser(OID.int8, parseInt8);
  pg.types.setTypeParser(OID.date, parseDate);
  pg.types.setTypeParser(OID.timestamptz, parseTimestamp);
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE || 5) });
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

// No dataDir → in-memory (tests).
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) {
    await mkdir(dataDir, { recursive: true });
    await lockDataDir(dataDir);
  }
  return wrapPglite(await PGlite.create(dataDir, { parsers: PGLITE_PARSERS }));
}

setDbFactory(async () => {
  const url = process.env.DATABASE_URL;
  const cloud = ["VERCEL", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_NAME", "RENDER", "FLY_APP_NAME"].find((k) => process.env[k]);
  if (!url && cloud) {
    // Cloud disks are wiped on redeploy; never silently store real orders there.
    throw new Error(`DATABASE_URL is not set (running on ${cloud}). Attach a Postgres database and set DATABASE_URL.`);
  }
  return url ? createPgDb(url) : createPgliteDb(process.env.PGLITE_DIR || "./.data/pglite");
});
