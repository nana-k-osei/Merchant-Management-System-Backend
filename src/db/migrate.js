import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;

// Uses DATABASE_URL from the environment to connect to Postgres.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// SQL migrations live at the repo root in /migrations.
const migrationsDir = path.resolve(__dirname, "..", "..", "migrations");

// Track applied migrations so reruns are safe and only new files execute.
async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function isApplied(filename) {
  const result = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1",
    [filename]
  );
  return result.rowCount > 0;
}

async function recordApplied(filename) {
  await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
    filename
  ]);
}

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  await ensureMigrationsTable();

  // Apply migrations in filename order (e.g. 001_*, 002_*).
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (await isApplied(file)) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }

    console.log(`Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    try {
      // Run each migration in its own transaction for clean rollbacks on failure.
      await pool.query("BEGIN");
      await pool.query(sql);
      await recordApplied(file);
      await pool.query("COMMIT");
      console.log(`OK ${file} done`);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
