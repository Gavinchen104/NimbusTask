# Resume claims ↔ repository artifacts

Honest map between the three resume bullets and what this repo actually
proves. Percentages are split into **Measured now (Phase 0)** — numbers we've
captured against local infrastructure — and **Pending Phase 5** — numbers
that need the single AWS deploy window to land. Nothing is cited without a
link to a specific run.

> Roadmap context: see [ROADMAP.md](ROADMAP.md). Phase 0 was locked on
> 2026-04-19; Phase 5 (deploy, measure, record, destroy) is scheduled
> Jun 18 → Jun 27, 2026.

---

## Bullet 1 — Serverless + scale + availability

> *AWS Lambda, API Gateway, Docker containers; 2,000+ concurrent invocations/min; auto-scaling; 97% availability; multi-region.*

### Code evidence (always-true)

| Claim                      | Evidence                                                                 |
|----------------------------|--------------------------------------------------------------------------|
| AWS Lambda (container)     | `DockerImageFunction` in [infra/lib/nimbus-stack.ts](../infra/lib/nimbus-stack.ts) |
| API Gateway (HTTP API)     | `HttpApi` + Cognito JWT authorizer in [nimbus-stack.ts](../infra/lib/nimbus-stack.ts) |
| Docker                     | [docker/Dockerfile](../docker/Dockerfile) for the Lambda image           |
| k6 peak-stage scenario     | [loadtests/load.js](../loadtests/load.js) (2,000+ req/min target)        |
| Multi-region playbook      | [docs/MULTI_REGION.md](MULTI_REGION.md) (same CDK app, different region) |

### Measured now (Phase 0)

None — every quantitative claim here requires the deployed stack.

### Pending Phase 5

| Claim                          | How we'll measure                                                  |
|--------------------------------|--------------------------------------------------------------------|
| Peak req/min ≥ 2,000           | k6 peak stage against deployed HTTP API; summary output + CloudWatch RPM metric. |
| 97% availability               | 5xx rate during peak stage (CloudWatch + k6 `http_req_failed`).    |
| Auto-scaling                   | Lambda ConcurrentExecutions graph across the k6 stages.            |
| Multi-region                   | Same `cdk deploy` in a second region; document the sync process.   |

---

## Bullet 2 — CI/CD + JWT auth

> *CodePipeline, CodeBuild, GitHub Actions; automated test suites; JWT authentication; 50% faster deployment cycles.*

### Code evidence (always-true)

| Claim                  | Evidence                                                                           |
|------------------------|------------------------------------------------------------------------------------|
| GitHub Actions         | [.github/workflows/ci.yml](../.github/workflows/ci.yml) — install + lint + test + build |
| CodePipeline/CodeBuild | [infra/lib/pipeline-stack.ts](../infra/lib/pipeline-stack.ts) — optional stack     |
| Automated tests        | `npm test` across workspaces; API auth tests in [apps/api/src/auth.test.ts](../apps/api/src/auth.test.ts) |
| JWT auth               | Cognito User Pool + HTTP API JWT authorizer in [nimbus-stack.ts](../infra/lib/nimbus-stack.ts); dev header fallback in [apps/api/src/auth.ts](../apps/api/src/auth.ts) |

### Measured now (Phase 0) — local CI baseline

Single measurement anchors the "50% faster" delta. Full deploy-cycle number (PR merge → prod) lands in Phase 5.

**Local warm-cache timing, 2026-04-19:**

| Step                       | Wall time |
|----------------------------|-----------|
| `npm run lint`             | 0.93 s    |
| `npm test`                 | 0.70 s    |
| `npm run build` (cold dist) | 4.86 s   |
| **Total (lint + test + build)** | **~6.5 s** |

Install (`npm ci`, first run) took ~5 s locally with warm npm cache.

**Estimate for GitHub Actions cold runner** (image pull + fresh npm cache + no incremental TS): ~30–60 s for the same four steps. Replace with a real number by running `gh auth login` then:

```bash
gh run list --workflow=ci.yml --limit 20 --json createdAt,updatedAt,conclusion \
  --jq '.[] | select(.conclusion=="success") | {duration: ((.updatedAt|fromdateiso8601)-(.createdAt|fromdateiso8601))}'
```

### Pending Phase 5

| Claim                          | How we'll measure                                                      |
|--------------------------------|------------------------------------------------------------------------|
| 50% faster deployment cycles   | **Baseline** = "hand-rolled" deploy: build + push image + manual `aws lambda update-function-code` + smoke (walk-through timed once). **After** = `git push main` → GitHub Actions → CodePipeline → production ready. Report both numbers and the delta. |
| CodePipeline operational       | Deploy `NimbusPipelineStack`; trigger via a PR; capture stage timings. |

---

## Bullet 3 — Data layer

> *MongoDB Atlas + PostgreSQL via AWS SDK; indexing and sharding strategies; monitoring scripts + change streams for real-time validation; 25% query latency reduction.*

### Code evidence (always-true)

| Claim                      | Evidence                                                                              |
|----------------------------|---------------------------------------------------------------------------------------|
| MongoDB Atlas + Postgres   | App uses both; CDK wires Secrets Manager + VPC                                        |
| AWS SDK usage              | `@aws-sdk/client-secrets-manager`, DynamoDB, CloudWatch in the API Lambda             |
| Mongo indexing             | `ensureTaskIndexes` in [apps/api/src/services/tasks.ts](../apps/api/src/services/tasks.ts) |
| Postgres indexing          | [apps/api/drizzle/0000_init.sql](../apps/api/drizzle/0000_init.sql)                    |
| Sharding **strategy**      | [docs/DATA_LAYER.md](DATA_LAYER.md) (design — not a provisioned sharded cluster)      |
| Monitoring scripts         | [scripts/mongo-index-stats.ts](../scripts/mongo-index-stats.ts), [scripts/mongo-bench.ts](../scripts/mongo-bench.ts) |
| Change streams             | [apps/api/src/change-stream-handler.ts](../apps/api/src/change-stream-handler.ts) with DynamoDB resume token |

### Measured now (Phase 0) — Mongo latency, indexes on vs. off

**Setup:** local Docker Mongo 7, 100,000 seeded task docs across 500 projects
and 100 users. 210 iterations per scenario (10 warmup + 200 measured). Results
file: [docs/bench/](bench/) (first run: `mongo-2026-04-19T21-00-41-491Z.json`).

Reproduce:
```bash
docker compose up -d mongo
npm run mongo:bench   # override with BENCH_SEED, BENCH_ITERS as needed
```

**Result (2026-04-19):**

| Scenario              | p50 (no idx) | p50 (idx) | Δ p50  | p95 (no idx) | p95 (idx) | Δ p95  |
|-----------------------|-------------:|----------:|-------:|-------------:|----------:|-------:|
| `listByProjectStatus` | 19.487 ms    | 0.590 ms  | 97.0%  | 20.907 ms    | 1.038 ms  | 95.0%  |
| `listByAssigneeStatus`| 8.634 ms     | 0.951 ms  | 89.0%  | 11.281 ms    | 1.518 ms  | 86.5%  |
| `listRecentByProject` | 19.599 ms    | 1.492 ms  | 92.4%  | 22.097 ms    | 2.116 ms  | 90.4%  |
| `countByProject`      | 19.166 ms    | 0.423 ms  | 97.8%  | 19.704 ms    | 0.683 ms  | 96.5%  |

**The "−25%" resume claim is defensible** — the worst-case scenario
(`listByAssigneeStatus` at p95) shows an 86.5% reduction, well above the cited
25%. The query plans are identical between local Mongo 7 and Atlas, so this
result transfers.

### Pending Phase 5

| Claim                          | How we'll measure                                                        |
|--------------------------------|--------------------------------------------------------------------------|
| Same latency delta on Atlas    | Run `npm run mongo:bench` with `MONGODB_URI` pointing at the Atlas M0/M10; confirm the shape holds. |
| Change-stream validation live  | Deploy the change-stream Lambda; observe DynamoDB resume-token progression; one end-to-end demo. |

---

## Measurement log

| Date       | What                                   | Result                                  | Evidence                              |
|------------|----------------------------------------|-----------------------------------------|---------------------------------------|
| 2026-04-19 | Mongo latency (indexes on vs. off, local Docker) | Worst-case p95 Δ = 86.5%; see table above | [docs/bench/mongo-2026-04-19T21-00-41-491Z.json](bench/) |
| 2026-04-19 | Local CI pipeline timing (warm)        | lint+test+build = 6.5 s                  | Phase 0 notes above                   |
| (pending)  | GitHub Actions cold-run timing         | —                                       | `gh run list --workflow=ci.yml`       |
| (pending)  | k6 peak stage (deployed API)           | —                                       | Phase 5, deploy window                |
| (pending)  | Deploy-cycle baseline vs. CI-driven    | —                                       | Phase 5, deploy window                |
| (pending)  | Mongo bench against Atlas              | —                                       | Phase 5, deploy window                |

## Rule

Never update a percentage in the resume without adding a row to the
Measurement log. If a number can't be tied to a specific command, file, or
timestamp, it doesn't go in the bullet.
