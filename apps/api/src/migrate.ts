import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

async function resolveMigrationsDir() {
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(sourceDir, "../migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "apps/api/migrations"),
  ];
  for (const dir of candidates) {
    try {
      await readdir(dir);
      return dir;
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Migrations directory not found. Checked: ${candidates.join(", ")}`);
}

export async function runMigrations() {
  await pool.query(`create table if not exists schema_migrations(
    filename text primary key,
    applied_at timestamptz not null default now()
  )`);

  const dir = await resolveMigrationsDir();
  const files = (await readdir(dir)).filter(x => /^\\d+_.*\\.sql$/.test(x)).sort();

  for (const filename of files) {
    const done = await pool.query("select 1 from schema_migrations where filename=$1", [filename]);
    if (done.rowCount) continue;

    const sql = await readFile(path.join(dir, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations(filename) values($1)", [filename]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
