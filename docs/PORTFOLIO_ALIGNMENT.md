# Resume claims ↔ repository artifacts

Use this as an honest map between portfolio bullets and what this repo **actually** contains. Quantitative claims (percentages, SLAs) should only be cited when **you** have supporting evidence (CloudWatch screenshots, k6 reports, before/after query traces).

## Serverless (Lambda, API Gateway, Docker)

| Claim | Evidence |
|--------|-----------|
| AWS Lambda | `infra/lib/nimbus-stack.ts` — `DockerImageFunction` for API and change-stream worker |
| API Gateway | HTTP API (`HttpApi`), routes, Cognito JWT authorizer |
| Docker | `docker/Dockerfile` — container image asset for Lambda |

## Load, scaling, availability, multi-region

| Claim | Evidence |
|--------|-----------|
| Simulating 2,000+ req/min | `loadtests/load.js` (k6); run after deploy with `API_BASE_URL` |
| Auto-scaling | Lambda concurrency scales with traffic (platform behavior); document **your** concurrency graphs if asked |
| 97% availability | **Not encoded in code.** Measure with CloudWatch (API/Lambda/error rates) over a window you choose; cite only with screenshots or exports |
| Multi-region | **Repeatable:** same CDK app in another region/account — see `docs/MULTI_REGION.md`. Not an active/active multi-region stack in one deploy |

## CI/CD (GitHub Actions, CodePipeline, CodeBuild)

| Claim | Evidence |
|--------|-----------|
| GitHub Actions | `.github/workflows/ci.yml` — install, lint, test, build |
| CodePipeline + CodeBuild | `infra/lib/pipeline-stack.ts` — optional stack; requires CodeStar connection |
| Automated tests | `npm test` across workspaces; API tests under `apps/api/src/**/*.test.ts` |
| JWT authentication | Cognito User Pool + HTTP API JWT authorizer in `nimbus-stack.ts` |

**“50% faster deployment cycles”** — process metric; not in repo. Use only if you measured it.

## Data layer (MongoDB Atlas, PostgreSQL, SDK, indexes, change streams)

| Claim | Evidence |
|--------|-----------|
| MongoDB Atlas + PostgreSQL | App uses both; CDK wires Secrets Manager + VPC |
| AWS SDK usage | `@aws-sdk/client-secrets-manager`, DynamoDB, CloudWatch in API; DB access uses `pg` / `mongodb` drivers |
| Indexing | Postgres: Drizzle/migrations; Mongo: `ensureTaskIndexes` in `apps/api/src/services/tasks.ts`; script `scripts/mongo-index-stats.ts` |
| Sharding **strategy** | Design notes in `docs/DATA_LAYER.md` — **not** a sharded cluster provisioned by this repo |
| Monitoring scripts | `scripts/mongo-index-stats.ts`, Powertools metrics, CloudWatch alarms in CDK |
| Change streams + validation | `apps/api/src/change-stream-handler.ts`, DynamoDB checkpoint table |

**“25% query latency reduction”** — cite only with **your** Atlas/CloudWatch or APM before/after numbers.

## Deployment order

Develop, test, and load-test locally or in CI first. Run **`cdk deploy`** only when you are ready — see README **Deploy (last step)**.
