import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { loadConfig } from "./config.js";
import { getPostgresConnectionString } from "./secrets.js";

let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export async function getDb(): Promise<NodePgDatabase<typeof schema>> {
  if (db) return db;
  const config = loadConfig();
  let connectionString: string;
  if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
  } else if (config.postgresSecretArn) {
    connectionString = await getPostgresConnectionString(config.postgresSecretArn);
  } else {
    throw new Error("DATABASE_URL or POSTGRES_SECRET_ARN required");
  }
  pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  db = drizzle(pool, { schema });
  return db;
}

export async function closePg(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
