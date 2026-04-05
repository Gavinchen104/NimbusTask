# Data layer: indexing and scaling strategy

## PostgreSQL (Amazon RDS)

- **Relational invariants:** users, teams, memberships, projects (`apps/api/src/db/schema.ts`, `apps/api/drizzle/0000_init.sql`).
- **Indexes:** unique indexes on `users(cognito_sub)` and `team_members(team_id, user_id)` to keep lookups and membership checks cheap as teams grow.
- **Scaling path:** vertical scaling (instance class), read replicas for read-heavy reporting, connection pooling (RDS Proxy) when your account supports it — optional future CDK change.

## MongoDB Atlas (tasks)

- **Workload:** task documents keyed by `projectId` with compound indexes for list-by-project and status filters (`ensureTaskIndexes`).
- **Change streams:** scheduled worker resumes from DynamoDB-backed checkpoints for async validation/metrics (`change-stream-handler.ts`).
- **Sharding strategy (when needed):** For a `tasks` collection that outgrows a single shard, a typical approach is **range or hashed sharding on `projectId`** (or `teamId`) so all tasks for a project stay co-located, preserving efficient list queries. Atlas handles chunk migration; **this repo does not provision a sharded cluster** — document the strategy in design reviews and enable sharding in Atlas when metrics (storage, QPS, index size) justify it.

## Monitoring

- **Atlas:** Performance Advisor, index suggestions, `scripts/mongo-index-stats.ts` for index inventory.
- **AWS:** Lambda Powertools metrics, CloudWatch alarms on errors and duration.
