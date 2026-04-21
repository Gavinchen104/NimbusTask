/**
 * Mongo latency bench — Phase 0 receipt for the "−X% query latency" bullet.
 *
 * Seeds a `tasks_bench` collection on the local Mongo, runs representative
 * queries with and without indexes, and prints a markdown table of p50/p95
 * latencies. Results are also written to docs/bench/mongo-<timestamp>.json
 * so PORTFOLIO_ALIGNMENT.md can cite a specific run.
 *
 * Usage:
 *   docker compose up -d mongo
 *   node --import tsx --env-file=.env scripts/mongo-bench.ts
 *
 * Env:
 *   MONGODB_URI      default mongodb://localhost:27017/nimbustask
 *   MONGO_DB_NAME    default nimbustask
 *   BENCH_SEED       default 100000  (rows to seed)
 *   BENCH_PROJECTS   default 500     (distinct projectIds)
 *   BENCH_USERS      default 100     (distinct assigneeUserIds)
 *   BENCH_ITERS      default 200     (query iterations per scenario)
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type Collection, type Db } from "mongodb";

const BENCH_COLL = "tasks_bench";

type Doc = {
  _id: string;
  projectId: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: Date;
  assigneeUserId: string;
  updatedAt: Date;
  createdAt: Date;
};

type Scenario = {
  name: string;
  run: () => Promise<unknown>;
};

type Stats = { p50: number; p95: number; p99: number; mean: number; n: number };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    p50: +percentile(sorted, 0.5).toFixed(3),
    p95: +percentile(sorted, 0.95).toFixed(3),
    p99: +percentile(sorted, 0.99).toFixed(3),
    mean: +mean.toFixed(3),
    n: sorted.length,
  };
}

async function timeQuery(fn: () => Promise<unknown>, iters: number): Promise<number[]> {
  // Warmup
  for (let i = 0; i < 10; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    await fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
  }
  return samples;
}

function statuses(): Doc["status"][] {
  return ["todo", "in_progress", "done", "blocked"];
}
function priorities(): Doc["priority"][] {
  return ["low", "medium", "high", "urgent"];
}

async function seed(coll: Collection<Doc>, size: number, projects: number, users: number): Promise<void> {
  await coll.deleteMany({});
  const BATCH = 5000;
  const statusSet = statuses();
  const prioSet = priorities();
  let inserted = 0;
  while (inserted < size) {
    const batch: Doc[] = [];
    const n = Math.min(BATCH, size - inserted);
    for (let i = 0; i < n; i++) {
      const pIdx = Math.floor(Math.random() * projects);
      const uIdx = Math.floor(Math.random() * users);
      const now = new Date(Date.now() - Math.floor(Math.random() * 30 * 86_400_000));
      batch.push({
        _id: randomUUID(),
        projectId: `p_${pIdx.toString().padStart(4, "0")}`,
        assigneeUserId: `u_${uIdx.toString().padStart(3, "0")}`,
        title: `Task ${inserted + i} ${Math.random().toString(36).slice(2, 8)}`,
        description: `desc ${Math.random().toString(36).slice(2, 12)}`,
        status: statusSet[Math.floor(Math.random() * statusSet.length)],
        priority: prioSet[Math.floor(Math.random() * prioSet.length)],
        dueDate: new Date(Date.now() + Math.floor(Math.random() * 30 * 86_400_000)),
        updatedAt: now,
        createdAt: now,
      });
    }
    await coll.insertMany(batch, { ordered: false });
    inserted += n;
  }
}

async function dropIndexes(coll: Collection<Doc>): Promise<void> {
  try {
    await coll.dropIndexes();
  } catch {
    // no-op if only the default _id index exists
  }
}

async function ensureIndexes(coll: Collection<Doc>): Promise<void> {
  await coll.createIndex({ projectId: 1, status: 1 });
  await coll.createIndex({ projectId: 1, dueDate: 1 });
  await coll.createIndex({ projectId: 1, priority: 1 });
  await coll.createIndex({ assigneeUserId: 1, status: 1 });
  await coll.createIndex({ updatedAt: -1 });
}

function buildScenarios(coll: Collection<Doc>, projects: number, users: number): Scenario[] {
  const randProject = () => `p_${Math.floor(Math.random() * projects).toString().padStart(4, "0")}`;
  const randUser = () => `u_${Math.floor(Math.random() * users).toString().padStart(3, "0")}`;
  return [
    {
      name: "listByProjectStatus",
      run: () =>
        coll
          .find({ projectId: randProject(), status: "todo" })
          .limit(100)
          .toArray(),
    },
    {
      name: "listByAssigneeStatus",
      run: () =>
        coll
          .find({ assigneeUserId: randUser(), status: "in_progress" })
          .limit(100)
          .toArray(),
    },
    {
      name: "listRecentByProject",
      run: () =>
        coll
          .find({ projectId: randProject() })
          .sort({ updatedAt: -1 })
          .limit(100)
          .toArray(),
    },
    {
      name: "countByProject",
      run: () => coll.countDocuments({ projectId: randProject() }),
    },
  ];
}

async function runPhase(
  label: string,
  coll: Collection<Doc>,
  projects: number,
  users: number,
  iters: number
): Promise<Record<string, Stats>> {
  const scenarios = buildScenarios(coll, projects, users);
  const out: Record<string, Stats> = {};
  for (const s of scenarios) {
    const samples = await timeQuery(s.run, iters);
    out[s.name] = stats(samples);
    const st = out[s.name];
    console.log(
      `  ${label.padEnd(12)} ${s.name.padEnd(22)} p50=${st.p50.toString().padStart(7)} ms   p95=${st.p95
        .toString()
        .padStart(7)} ms   p99=${st.p99.toString().padStart(7)} ms`
    );
  }
  return out;
}

function markdownTable(noIdx: Record<string, Stats>, withIdx: Record<string, Stats>): string {
  const rows: string[] = [];
  rows.push("| Scenario | p50 (no idx) | p50 (idx) | Δ p50 | p95 (no idx) | p95 (idx) | Δ p95 |");
  rows.push("|----------|------------:|----------:|------:|-------------:|----------:|------:|");
  for (const k of Object.keys(noIdx)) {
    const a = noIdx[k];
    const b = withIdx[k];
    const d50 = a.p50 === 0 ? 0 : ((a.p50 - b.p50) / a.p50) * 100;
    const d95 = a.p95 === 0 ? 0 : ((a.p95 - b.p95) / a.p95) * 100;
    rows.push(
      `| \`${k}\` | ${a.p50} ms | ${b.p50} ms | ${d50.toFixed(1)}% | ${a.p95} ms | ${b.p95} ms | ${d95.toFixed(1)}% |`
    );
  }
  return rows.join("\n");
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/nimbustask";
  const dbName = process.env.MONGO_DB_NAME ?? "nimbustask";
  const size = Number.parseInt(process.env.BENCH_SEED ?? "100000", 10);
  const projects = Number.parseInt(process.env.BENCH_PROJECTS ?? "500", 10);
  const users = Number.parseInt(process.env.BENCH_USERS ?? "100", 10);
  const iters = Number.parseInt(process.env.BENCH_ITERS ?? "200", 10);

  console.log(
    `Bench: size=${size} projects=${projects} users=${users} iters=${iters} db=${dbName}`
  );

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db: Db = client.db(dbName);
    const coll = db.collection<Doc>(BENCH_COLL);

    console.log("Seeding…");
    const tSeed = Date.now();
    await seed(coll, size, projects, users);
    console.log(`  seeded ${size} docs in ${Date.now() - tSeed} ms`);

    console.log("Dropping all non-_id indexes…");
    await dropIndexes(coll);
    console.log("Phase A — no indexes");
    const noIdx = await runPhase("[no idx]", coll, projects, users, iters);

    console.log("Creating indexes (matches ensureTaskIndexes)…");
    await ensureIndexes(coll);
    console.log("Phase B — with indexes");
    const withIdx = await runPhase("[indexed]", coll, projects, users, iters);

    const result = {
      meta: {
        at: new Date().toISOString(),
        mongoUri: uri.replace(/\/\/[^@]+@/, "//***@"),
        dbName,
        collection: BENCH_COLL,
        seedSize: size,
        projects,
        users,
        iterations: iters,
      },
      noIndex: noIdx,
      indexed: withIdx,
    };

    const here = dirname(fileURLToPath(import.meta.url));
    const outDir = resolve(here, "..", "docs", "bench");
    await mkdir(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outFile = resolve(outDir, `mongo-${stamp}.json`);
    await writeFile(outFile, JSON.stringify(result, null, 2));
    console.log(`\nWrote ${outFile}`);

    console.log("\n--- Markdown table (paste into PORTFOLIO_ALIGNMENT.md) ---\n");
    console.log(markdownTable(noIdx, withIdx));
    console.log("");
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
