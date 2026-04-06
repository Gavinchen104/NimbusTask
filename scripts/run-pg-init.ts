/**
 * Run once against DATABASE_URL or local Postgres to create tables (see apps/api/drizzle/0000_init.sql).
 * From repo root, `npm run migrate:pg` loads `.env` (Node `--env-file`). Or: `DATABASE_URL=... npm run migrate:pg`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL");
    process.exit(1);
  }
  const sqlPath = join(
    __dirname,
    "../apps/api/drizzle/0000_init.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.error("Migration applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
