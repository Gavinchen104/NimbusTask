# NimbusTask Roadmap — Locked (local-first)

**Owner:** Gavin · **Locked:** 2026-04-19 · **Horizon:** ~10 weeks (through Jun 27, 2026)

> PM framing: the resume bullets are already written — they need to be
> *defensible*. Build everything locally first, batch all AWS work into a
> single deploy-and-measure phase at the end. Measure before claiming, ship
> fewer things with receipts, don't pay for idle NAT Gateways along the way.

---

## Locked constraints

| Constraint           | Value                                                                                  |
|----------------------|----------------------------------------------------------------------------------------|
| Interview target     | **SaaS platform** — drives Phase 4 toward Postgres row-level multi-tenancy.            |
| AWS budget           | **Free tier only** — **zero deploys until Phase 5** (see rulebook below).              |
| Demo format          | **Recorded video + polished README** — no always-on infra.                             |
| Start                | **Today, Apr 19, 2026** — ~15 hrs/wk solo pace.                                        |

### Local-first / deploy-last rulebook

All development through Phase 4 happens **entirely on the local machine**.
AWS is touched exactly once, in Phase 5, for a single deploy-measure-record-destroy
window. Rationale:

- NAT Gateway (`natGateways: 1` in [infra/lib/nimbus-stack.ts:35](../infra/lib/nimbus-stack.ts#L35)) bleeds ~$32/mo whenever the stack is up. One window > five windows.
- Faster iteration: no `cdk deploy` in the inner loop.
- Single risk point for the deploy: one buffer week at the end to debug.

**Local substitutes for AWS services (use through Phase 4)**

| AWS service (Phase 5) | Local substitute (Phases 0–4)          | Swap point                 |
|-----------------------|----------------------------------------|----------------------------|
| DynamoDB              | **DynamoDB Local** in Docker Compose   | Endpoint URL env var       |
| S3 (pre-signed URLs)  | **MinIO** in Docker Compose            | S3 endpoint + path-style   |
| EventBridge           | In-process event bus behind an `EventPublisher` interface | Swap the impl, not the caller |
| API Gateway + Lambda  | `dev-server.ts` (already exists)       | Handler code is identical  |
| Cognito JWT           | `X-Dev-User-Id` headers (already exists) | Auth middleware branch    |
| Secrets Manager / SSM | `.env` file                            | Secret resolver interface  |
| CloudWatch            | `pino` → stdout; metrics via console   | Logger adapter             |

**Rule:** write every integration behind a thin interface so Phase 5 swaps
implementations, not call sites. No `aws-sdk` imports outside the adapter layer.

---

## TL;DR

| Phase | Theme                          | Dates               | Work days | AWS? |
|-------|--------------------------------|---------------------|-----------|------|
| 0     | Local baselines                | Apr 19 → Apr 22     | ~3        | No   |
| 1     | Operability (local)            | Apr 23 → May 6      | ~10       | No   |
| 2     | Contract & tests (local)       | May 7 → May 13      | ~5        | No   |
| 3     | Differentiators (local)        | May 14 → Jun 3      | ~15       | No   |
| 4     | SaaS stretch: RLS + SLO prep   | Jun 4 → Jun 17      | ~10       | No   |
| **5** | **Deploy, measure, record, destroy** | **Jun 18 → Jun 27** | **~5–7** | **Yes (one window)** |

**North-star metric:** interview questions this repo answers convincingly
with code + a measurement. Today ~5. Target by Jun 27: 15+.

---

## Phase 0 — Local baselines (Apr 19 → Apr 22)

**Goal:** capture every measurement that doesn't require AWS. Stage everything
else for Phase 5.

**Deliverables**
- Mongo **query-latency bench** with indexes on vs. off — run against local Docker Mongo. This is the honest number behind the "−25% under peak" claim; the query plan is the same locally and in Atlas, so this is defensible now.
- **CI timing baseline** — how long does `npm ci && lint && test && build && synth` take on a cold GitHub Actions runner? Captured from existing workflow runs.
- **k6 script finalized** against the local `dev-server.ts` to prove the harness works. Real peak-rate measurement happens in Phase 5.
- [docs/PORTFOLIO_ALIGNMENT.md](PORTFOLIO_ALIGNMENT.md) split into "measured now" vs. "pending Phase 5" sections; no inflated claims.

**Success criteria**
- A local Mongo latency table with three data points (cold, warm, warm+index).
- A one-line answer to "how long is your CI?"
- Every bullet in `PORTFOLIO_ALIGNMENT.md` tagged *measured* or *pending*.

**No AWS. Local only.**

---

## Phase 1 — Operability, local (Apr 23 → May 6)

**Goal:** make the code read as "someone who has been on-call." Everything
lands against local Docker services.

**Scope (P0 items 1–3 from [CLAUDE.md §10](../CLAUDE.md))**
- **Idempotency keys** on mutating endpoints, **DynamoDB Local** via Docker Compose with a TTL attribute.
- **Token-bucket rate limiting** via DynamoDB atomic counters (Local in dev, real DDB in Phase 5; same code), `Retry-After` on 429.
- **Structured JSON logs + `x-request-id`** propagated from HTTP edge through every Lambda and DB call using `pino` + AsyncLocalStorage.

**Local-first wiring**
- Add a `dynamodb-local` service to `docker-compose.yml`.
- Introduce `apps/api/src/lib/ddb.ts` with a client that reads `DYNAMODB_ENDPOINT` (unset in AWS).
- `packages/shared/src/errors.ts` for 429 and idempotency conflicts.

**Success criteria**
- k6 scenario against local API that retries every request produces **zero duplicates** in a Mongo count check.
- 429s observed at published limits; integration test covers the race.
- One request ID pulls every log line for that request end-to-end.

---

## Phase 2 — Contract & tests (May 7 → May 13)

**Goal:** kill drift between web and API, replace mocks with real databases.

**Scope (P0 items 4–5)**
- `openapi-typescript` in `packages/shared`; CI fails on schema drift; web client imports generated types.
- Replace service-level mocks with **Testcontainers-backed** Postgres + Mongo (+ DynamoDB Local).

**Success criteria**
- Editing `openapi/openapi.yaml` breaks the web build until both sides update.
- `apps/api/src/services/*.test.ts` hits real containers in CI and locally.
- CI wall-clock stays < 5 min (parallelize/cache if not).

---

## Phase 3 — Differentiators, local (May 14 → Jun 3)

**Goal:** three SaaS-flavored features a reviewer rarely sees on portfolio
serverless apps, all built behind interfaces that swap cleanly to AWS in Phase 5.

**Locked scope**
- **Pre-signed upload URLs for task attachments.** In dev, backed by **MinIO** (S3-compatible). API: `POST /tasks/:id/attachments/upload-url`. Bucket lifecycle rules defined in CDK now so they're ready at deploy.
- **Event-driven `task.created` fan-out + DLQ.** In dev, an in-process `EventPublisher` + a fake subscriber and a fake DLQ (both are just lists in memory with tests). In Phase 5 the adapter swaps to EventBridge + SQS + DLQ — call sites don't change.
- **Append-only audit log** (`{tenant, actor, action, before, after, ts}`). DynamoDB Local in dev → real DynamoDB in Phase 5. Middleware in `apps/api/src/router.ts` writes one entry per authed mutation.

> *Why audit log, not cold-start:* Node.js can't use SnapStart; provisioned
> concurrency costs money. Audit log is a universal SaaS requirement, stays
> on the free tier, and demos beautifully ("show me everything user X did
> in the last hour").

**Success criteria**
- Attachments round-trip through the web UI against MinIO in local Docker.
- Killing a local subscriber routes events to the fake DLQ; an integration test asserts the alarm logic without AWS.
- Every authed mutation produces an audit entry; a "user X last hour" query returns in < 200 ms against DynamoDB Local.

---

## Phase 4 — SaaS stretch (Jun 4 → Jun 17)

**Goal:** the above-the-bar SaaS signal, **100% local**.

**Locked scope**
- **Postgres row-level multi-tenancy.** `SET app.current_team = $1` + RLS policies on every team-scoped table. A test proves a crafted query from user A can't read team B's tasks.
- **SLO + error-budget runbook (text only).** Define SLOs using Phase 0 baselines + Phase 5 peak numbers (fill after Phase 5). Write [docs/RUNBOOK.md](RUNBOOK.md) now with placeholders; dashboard screenshot added post-Phase-5.

**Success criteria**
- RLS: leakage test is **red** when the policy is removed, **green** when applied. Short `docs/MULTI_TENANCY.md` explains the model.
- Runbook: SLOs, burn-rate thresholds, freeze criteria, paging contacts — all written, numbers filled from Phase 0 + placeholders for Phase 5.

---

## Phase 5 — Deploy, measure, record, destroy (Jun 18 → Jun 27)

**The only AWS phase. Single deploy window. Plan every hour of it.**

**Pre-flight (do before touching CDK)**
- AWS Budget alert at **$5**.
- Hand-write a demo script: click-by-click for the Loom recording.
- Hand-write a measurement script: every k6 run, every CloudWatch query, every screenshot needed.
- Dry-run `cdk synth`; verify MinIO/DDB-Local adapters flip to real AWS via env vars only.

**Day 1–2: Deploy + smoke**
- `cdk bootstrap` → `cdk deploy NimbusStack`.
- Apply Postgres DDL via `scripts/run-pg-init.ts`. Rotate Secrets Manager Mongo URI to real Atlas. NAT egress IP allow-listed in Atlas.
- Smoke the happy paths with real Cognito tokens.

**Day 3: Measure**
- k6 peak run → capture 5xx rate + p95/p99 + throughput → availability number.
- Time a PR-to-prod deploy via GitHub Actions + CDK → deploy-cycle number.
- Run the Mongo latency bench against Atlas to confirm the local numbers hold in prod.
- Fill every "pending Phase 5" entry in `PORTFOLIO_ALIGNMENT.md`.

**Day 4: Record**
- Loom walkthrough: login → create team → task → upload attachment → see event fan-out → see audit entry → cross-tenant query blocked by RLS → CloudWatch dashboard.

**Day 5: Polish + destroy**
- SLO dashboard screenshots embedded in README. Final PORTFOLIO_ALIGNMENT update.
- `cdk destroy NimbusStack`. Verify in the AWS console. Atlas IP allow-list cleaned up.

**Buffer (days 6–7)**
- Re-deploy if the demo video needs a re-shoot or a measurement is bad.
- If all green: use the buffer for README polish and interview prep.

**Success criteria**
- Demo video published. README links to it.
- Every percentage in resume bullets cites a specific log or run.
- AWS console shows no running resources; budget alarm never fired.

---

## What we're explicitly *not* doing

- Billing / Stripe, realtime collab, mobile, org-wide RBAC, GraphQL.
- Full OpenTelemetry migration (X-Ray stays).
- Cold-start optimization (not free-tier friendly for Node).
- Full-text search, feature flags, secrets rotation (deferred to next horizon).
- Any AWS deploy before Jun 18.
- More than 1 stretch beyond RLS + SLO.

---

## Risks & mitigations

| Risk                                                   | Mitigation                                                                 |
|--------------------------------------------------------|----------------------------------------------------------------------------|
| Phase 5 deploy blows up, no time to recover            | 2-day buffer at end; `cdk synth` dry-run on day 0; adapter pattern keeps delta small. |
| "Works locally, breaks in prod" gap                    | Testcontainers + MinIO + DynamoDB Local match prod APIs; Phase 2 real-DB tests catch most. |
| Single forgotten `cdk destroy` eats the free tier      | Calendar reminder + AWS Budget at $5 + checklist item in Phase 5 day 5.    |
| Phase 0 baselines reveal a bullet is not defensible    | Rewrite the bullet now; don't wait for Phase 5 to be surprised.            |
| Scope creep mid-phase                                  | [CLAUDE.md](../CLAUDE.md) §4 non-goals + §10 tiering is the filter.        |

---

## Tracking

- [ ] Phase 0 — Mongo bench + CI timing + PORTFOLIO_ALIGNMENT split
- [ ] Phase 1 — idempotency, rate limit, correlation IDs (DDB Local)
- [ ] Phase 2 — OpenAPI client + Testcontainers green
- [ ] Phase 3 — pre-signed uploads (MinIO), in-proc events + DLQ, audit log (DDB Local)
- [ ] Phase 4 — RLS leakage test green, runbook drafted
- [ ] Phase 5 — deploy, measure, record, destroy; PORTFOLIO_ALIGNMENT complete
