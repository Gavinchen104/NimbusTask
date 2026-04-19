# NimbusTask — Product Brief for Claude Code

> **Role**: You are contributing to a portfolio-grade, production-styled serverless
> task management platform. Treat this doc as the source of truth for *what we are
> building and why*. When a code change and this doc disagree, ask before drifting.

---

## 1. Product vision

**NimbusTask** is a team-oriented task management API and web UI, built on a
cloud-native serverless stack. It exists to demonstrate — end-to-end — that the
system can be designed, shipped, load-tested, and operated the way a real SaaS
product would be, while staying cheap enough to run from a single AWS account.

**One-line pitch:** *"Slack-for-tasks infra: Lambda + API Gateway in front, Postgres
+ MongoDB + DynamoDB behind, CDK and GitHub Actions around it."*

**Primary region:** `us-east-1` (N. Virginia) — lowest-latency AWS region to Durham, NC.

---

## 2. Resume bullets this repo must defend

These are the three claims the project was scoped to support. Every architectural
decision, doc, and test should map back to at least one of them.

### Bullet 1 — Serverless infra at scale
> *Architected cloud-native serverless infrastructure using AWS Lambda, API Gateway,
> and Docker containers, simulating 2,000+ concurrent invocations/min with
> auto-scaling and 97% availability across multi-region deployments.*

**How the repo defends it:**
- Lambda container image: [docker/Dockerfile](docker/Dockerfile)
- HTTP API Gateway + Lambda wiring: [infra/lib/nimbus-stack.ts](infra/lib/nimbus-stack.ts)
- Load scenario at ≥2,000 req/min peak: [loadtests/load.js](loadtests/load.js)
- Multi-region playbook: [docs/MULTI_REGION.md](docs/MULTI_REGION.md)
- Availability evidence is **user-supplied** — see
  [docs/PORTFOLIO_ALIGNMENT.md](docs/PORTFOLIO_ALIGNMENT.md) before quoting 97%.

### Bullet 2 — CI/CD + auth
> *Designed and implemented CI/CD pipelines with AWS CodePipeline, CodeBuild, and
> GitHub Actions, integrating automated test suites and JWT authentication,
> reducing deployment cycles by 50% across a multi-developer project.*

**How the repo defends it:**
- GitHub Actions: [.github/](.github/)
- Optional CodePipeline/CodeBuild stack: [infra/lib/pipeline-stack.ts](infra/lib/pipeline-stack.ts)
- JWT via Amazon Cognito: [apps/api/src/auth.ts](apps/api/src/auth.ts) + [apps/api/src/auth.test.ts](apps/api/src/auth.test.ts)
- Quality gates mirror CI locally: `npm run lint && npm run test && npm run build`
- "50% faster" needs a **before/after number** — keep it honest in portfolio copy.

### Bullet 3 — Data layer
> *Integrated MongoDB Atlas and PostgreSQL via AWS SDK with indexing and sharding
> strategies, building monitoring scripts and change streams for real-time
> validation, cutting query latency by 25% under peak loads.*

**How the repo defends it:**
- Postgres DDL (teams/memberships/projects): [apps/api/drizzle/0000_init.sql](apps/api/drizzle/0000_init.sql)
- Mongo tasks service + indexes: [apps/api/src/services/tasks.ts](apps/api/src/services/tasks.ts)
- Indexing/sharding notes: [docs/DATA_LAYER.md](docs/DATA_LAYER.md)
- Change stream Lambda + DynamoDB checkpoints: [apps/api/src/change-stream-handler.ts](apps/api/src/change-stream-handler.ts)
- Mongo monitoring script: [scripts/mongo-index-stats.ts](scripts/mongo-index-stats.ts)
- Postgres init runner: [scripts/run-pg-init.ts](scripts/run-pg-init.ts)

---

## 3. Success metrics (what "done" looks like)

| Area         | Metric                                                     | Target                  | Where it lives                  |
|--------------|------------------------------------------------------------|-------------------------|---------------------------------|
| Throughput   | Peak sustained request rate                                | ≥ 2,000 req/min          | k6 summary                      |
| Availability | Rolling success rate during k6 peak stage                  | ≥ 97%                    | CloudWatch 5xx + k6             |
| Latency      | p95 `GET /tasks` under peak                                | Baseline ➜ −25%          | CloudWatch + k6 metrics         |
| Deploy speed | PR merge ➜ prod deploy                                     | Baseline ➜ −50%          | GitHub Actions + CodePipeline   |
| Security     | All authed routes reject missing/invalid JWT               | 100%                    | [auth.test.ts](apps/api/src/auth.test.ts) |

"Baseline" numbers are the user's to measure. Do not hard-code claims into docs
without evidence.

---

## 4. Scope & non-goals

**In scope:**
- Multi-tenant teams, memberships, projects, tasks
- JWT auth (Cognito in AWS, `X-Dev-User-*` headers locally)
- Real-time validation via Mongo change streams
- Static React web UI hosted separately (S3/CloudFront or Amplify)
- One-command local dev via Docker Compose

**Out of scope (for now):**
- Billing / Stripe
- Realtime collaboration (WebSockets, presence)
- Mobile apps
- Org-level RBAC beyond team membership
- Production-grade observability (we stop at CloudWatch alarms + X-Ray)

If a request lands outside this list, confirm with the user before building it.

---

## 5. Architecture snapshot

```
React (Vite, :5173)            ──► HTTP API Gateway ──► Lambda (container image)
                                                        │
                           Cognito JWT  ◄──────────────┤
                                                        ├─► RDS PostgreSQL (private subnet)
                                                        ├─► MongoDB Atlas (NAT egress)
                                                        └─► Secrets Manager

Scheduled Lambda ──► Mongo change stream ──► DynamoDB (resume token checkpoint)
All Lambdas ──► CloudWatch Logs + X-Ray
```

Canonical diagram and narrative: [README.md](README.md).

---

## 6. Repo map

```
apps/
  api/       Lambda handler, router, auth, services, Drizzle migrations
  web/       React + Vite SPA
packages/
  shared/    Zod schemas + shared TS types (published as @nimbustask/shared)
infra/       AWS CDK (NimbusStack + optional NimbusPipelineStack)
docker/      Dockerfile for the API Lambda container image
loadtests/   k6 scripts (peak ≥ 2,000 req/min)
openapi/     OpenAPI 3 spec for the API
scripts/     One-shot ops: Postgres init, Mongo index stats
docs/        DATA_LAYER, MULTI_REGION, PORTFOLIO_ALIGNMENT
```

Workspace layout is npm workspaces (`apps/*`, `packages/*`, `infra`). Treat
`@nimbustask/shared` as the shared contract between API and web.

---

## 7. Working agreements for Claude

1. **Evidence over claims.** Before updating a resume-facing number, point to the
   command/log/dashboard that produced it.
2. **Order of operations** for any change that could cost AWS money: lint ➜ test
   ➜ build ➜ k6 (optional) ➜ `cdk deploy` *last*.
3. **Docker-first local dev.** Don't recommend installing Postgres/Mongo on the
   host unless the user opts in.
4. **Ports to remember:** API dev server on **3000**, web UI on **5173**,
   Postgres on host **5433** (mapped to container 5432), Mongo on **27017**.
5. **Auth in dev vs AWS.** Locally, use `X-Dev-User-Id` / `X-Dev-User-Email`
   headers. In AWS, Cognito-issued JWT.
6. **Shared types.** New request/response shapes go in `packages/shared` so the
   web client and API never drift.
7. **Migrations.** Postgres changes land as new files under
   `apps/api/drizzle/`. Never edit `0000_init.sql` after it has been applied.
8. **Honest docs.** `docs/PORTFOLIO_ALIGNMENT.md` is the ground truth for which
   metrics are measured vs aspirational — update it when numbers change.

---

## 8. Quick commands

```bash
# One-time
npm ci
docker compose up -d
cp .env.example .env
npm run migrate:pg

# Daily
npm run dev            # API on :3000
npm run dev:web        # Web on :5173

# Quality gates (mirror CI)
npm run lint && npm run test && npm run build

# Load test (needs deployed API)
export API_BASE_URL="https://YOUR_ID.execute-api.us-east-1.amazonaws.com"
k6 run loadtests/load.js

# Deploy (spends money)
cd infra && npx cdk deploy NimbusStack
```

---

## 9. Open product questions

Track these in conversation — they shape upcoming work:

- **Real availability number.** Need a k6 peak-stage run we can cite honestly.
- **Deploy-speed baseline.** What was the pre-CI cadence so the "−50%" claim has
  a denominator?
- **Sharding trigger.** At what task-collection size do we move from the
  single-cluster plan in `DATA_LAYER.md` to a sharded deployment?
- **Multi-region story.** Active-active vs warm standby — `MULTI_REGION.md` is
  currently a playbook, not a decision.

---

## 10. Recommended features — recruiter's lens

> *Framing: read this as a senior SWE recruiter / hiring manager. The resume
> bullets get you the phone screen; this section is what gets you past the
> on-site. Each item below is something a reviewer specifically looks for
> and often finds missing in portfolio serverless apps.*

### P0 — ship these next (distributed-systems & operability literacy)

1. **Idempotency keys on mutating endpoints.**
   - *What:* `Idempotency-Key` header on `POST /tasks` etc., stored in DynamoDB with TTL.
   - *Why reviewers care:* Shows you understand at-least-once delivery and client retries. Standard question: *"what happens if the client retries after a 504?"*
   - *Lands in:* new `apps/api/src/lib/idempotency.ts` + DynamoDB table in CDK.

2. **Token-bucket rate limiting per user + per IP.**
   - *What:* Redis (ElastiCache) or DynamoDB atomic counters, with 429 responses and `Retry-After`.
   - *Why:* Every serverless app gets this question. Bonus if you explain why you picked token bucket vs sliding window.
   - *Lands in:* middleware in `apps/api/src/router.ts` + WAF rule for crude layer-7.

3. **Structured logging with request correlation IDs.**
   - *What:* JSON logs, `x-request-id` propagated from API Gateway → Lambda → DB spans, pino or similar.
   - *Why:* "Walk me through debugging a slow request in prod" — you want one trace to pull.
   - *Lands in:* `apps/api/src/lib/logger.ts`, enforced in `handler.ts`.

4. **OpenAPI-generated TypeScript client for the web app.**
   - *What:* `openapi-typescript` or `orval` in `packages/shared` that regenerates on spec change; CI fails if types drift.
   - *Why:* Demonstrates API-as-contract thinking and kills a whole class of front/back-end bugs.
   - *Lands in:* `packages/shared/src/generated/`, wired into `apps/web/src/api.ts`.

5. **Integration tests with Testcontainers (real Postgres + Mongo).**
   - *What:* Replace mocks in `apps/api/src/services/*.test.ts` with Testcontainers-backed instances.
   - *Why:* Mocked DB tests are the #1 "looks fake" signal on portfolios.
   - *Lands in:* `apps/api/src/services/*.test.ts` + Docker-in-Docker in CI.

### P1 — strong differentiators (the "this candidate has built for real" tier)

6. **File attachments via S3 pre-signed URLs.**
   - *What:* `POST /tasks/:id/attachments/upload-url` returns a pre-signed PUT; client uploads directly to S3; server records the object key.
   - *Why:* Shows you know not to proxy file bytes through Lambda. Common anti-pattern.
   - *Lands in:* new `apps/api/src/services/attachments.ts` + S3 bucket in CDK with lifecycle rules.

7. **Event-driven fan-out via EventBridge or SNS+SQS, with DLQ.**
   - *What:* `task.created` event published; consumers (notifications, search index) subscribe; failed messages land in DLQ with CloudWatch alarm.
   - *Why:* Proves you can decouple. DLQ tells the reviewer you've been burned before.
   - *Lands in:* `infra/lib/nimbus-stack.ts` + `apps/api/src/events/`.

8. **Full-text task search (Postgres `tsvector` or OpenSearch).**
   - *What:* Search by title/description with ranking, highlight, and pagination. Start with Postgres tsvector (cheap); document the OpenSearch migration trigger.
   - *Why:* Real apps have search. The decision log matters more than the tech.
   - *Lands in:* migration + `apps/api/src/services/search.ts`.

9. **Feature flags.**
   - *What:* Either AWS AppConfig or a homegrown DynamoDB-backed flag service with per-user overrides.
   - *Why:* Shows release-engineering maturity (dark launches, kill switches).
   - *Lands in:* `apps/api/src/lib/flags.ts`, consumed in both API and web.

10. **Lambda cold-start mitigation.**
    - *What:* Minimize bundle size (esbuild tree-shake), enable SnapStart *or* scheduled provisioned concurrency only on the hot API Lambda. Document p99 before/after.
    - *Why:* Most portfolio serverless apps never measure cold starts.
    - *Lands in:* `docker/Dockerfile`, `infra/lib/nimbus-stack.ts`, a new section in `PORTFOLIO_ALIGNMENT.md`.

11. **Audit log (append-only).**
    - *What:* Every auth'd mutation writes `{who, what, when, diff}` to a separate store (DynamoDB or Mongo capped collection).
    - *Why:* Security/compliance literacy. Multi-tenant SaaS always needs this.
    - *Lands in:* middleware in `apps/api/src/router.ts` + new service.

### P2 — stretch (these put you above the bar, not just at it)

12. **SLO dashboard + error budget policy.**
    - *What:* Define SLOs (e.g., 99% of `POST /tasks` < 300ms, 99.5% success). Ship a CloudWatch dashboard and a runbook that says "freeze deploys when budget burns > 2x."
    - *Why:* Ops maturity signal. Interviewers love asking "what's your SLO?"

13. **Chaos drill in CI.**
    - *What:* One test run per week that injects latency into Mongo or kills the change-stream Lambda, asserts graceful behavior.
    - *Why:* Rare on portfolios; immediate credibility.

14. **Row-level multi-tenancy in Postgres.**
    - *What:* `SET app.current_team = $1` + RLS policies on all team-scoped tables, with tests that prove cross-tenant leakage is blocked.
    - *Why:* Senior-level SaaS concern. Shows you've thought about blast radius of a bug.

15. **Secrets rotation.**
    - *What:* Automated rotation for the DB password via Secrets Manager Lambda rotator; Lambdas read the secret with a short cache TTL.
    - *Why:* "How do you rotate the DB password with zero downtime?" is a real interview question.

16. **Accessibility + Lighthouse in CI.**
    - *What:* `axe-core` on the React app's key pages; Lighthouse CI budget for LCP/CLS/TBT; PR fails if regressed.
    - *Why:* Frontend depth signal and an easy way to show you care about users, not just uptime.

17. **OpenTelemetry traces end-to-end.**
    - *What:* Replace/augment X-Ray with OTEL exporter → ADOT collector. Correlate API ↔ DB ↔ change-stream spans.
    - *Why:* Vendor-neutral observability is an on-trend differentiator.

### How to use this list

- Pick from P0 first — they close the most common "portfolio gaps" reviewers flag.
- For each feature you ship, add a short entry to `docs/PORTFOLIO_ALIGNMENT.md`
  with the *before / after / how to verify* story. Features without receipts
  are not worth claiming.
- Don't do all 17. Five done well (with metrics, tests, and a paragraph on
  trade-offs) beats seventeen half-built. Pick the ones that round out the three
  resume bullets most convincingly.
