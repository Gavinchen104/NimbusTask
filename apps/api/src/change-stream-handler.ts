/**
 * Consumes MongoDB change streams on `tasks` with DynamoDB resume checkpoints.
 * Invoked on a schedule (see CDK). For continuous streaming, tighten the schedule or use a long-running worker.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Context } from "aws-lambda";
import {
  MongoClient,
  type ChangeStreamDocument,
  type Document,
  type ResumeToken,
} from "mongodb";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { loadConfig } from "./lib/config.js";
import { getMongoUri } from "./lib/secrets.js";

const logger = new Logger({ serviceName: "nimbustask-change-stream" });
const metrics = new Metrics({
  namespace: "NimbusTask",
  serviceName: "nimbustask-change-stream",
});

const CHECKPOINT_PK = "tasks_change_stream";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function validateTaskChange(change: ChangeStreamDocument<Document>): void {
  if (!("fullDocument" in change) || !change.fullDocument) return;
  const doc = change.fullDocument;
  const status = doc.status as string | undefined;
  const valid = ["todo", "in_progress", "done", "blocked"].includes(status ?? "");
  if (!valid) {
    logger.warn("Invalid task status from change stream", { status, id: doc._id });
    metrics.addMetric("ChangeStreamInvalidStatus", MetricUnit.Count, 1);
  }
}

async function loadResumeToken(
  tableName: string
): Promise<ResumeToken | undefined> {
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: CHECKPOINT_PK },
    })
  );
  const raw = out.Item?.token;
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as ResumeToken;
  } catch {
    return undefined;
  }
}

async function saveResumeToken(
  tableName: string,
  token: ResumeToken
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: CHECKPOINT_PK,
        token: JSON.stringify(token),
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

export async function changeStreamHandler(
  _event: unknown,
  context: Context
): Promise<{ statusCode: number; body: string }> {
  logger.appendKeys({ requestId: context.awsRequestId });
  const config = loadConfig();
  const table = config.changeStreamCheckpointTable;
  if (!config.mongoSecretArn || !table) {
    logger.error("Missing MONGO_SECRET_ARN or CHANGE_STREAM_CHECKPOINT_TABLE");
    return { statusCode: 500, body: "Misconfigured" };
  }

  const uri = await getMongoUri(config.mongoSecretArn);
  const mongo = new MongoClient(uri);
  await mongo.connect();
  const db = mongo.db(config.mongoDbName);
  const resume = await loadResumeToken(table);

  const stream = db.collection("tasks").watch([], {
    ...(resume ? { resumeAfter: resume } : {}),
    maxAwaitTimeMS: 3000,
  });

  const deadline = Date.now() + 55_000;
  let processed = 0;

  try {
    for await (const change of stream) {
      validateTaskChange(change);
      processed++;
      const token = stream.resumeToken;
      if (token) await saveResumeToken(table, token);
      metrics.addMetric("ChangeStreamEvents", MetricUnit.Count, 1);
      if (Date.now() > deadline) break;
    }
  } catch (err) {
    logger.error("Change stream error", { err });
    metrics.addMetric("ChangeStreamErrors", MetricUnit.Count, 1);
    throw err;
  } finally {
    await stream.close().catch(() => {});
    await mongo.close().catch(() => {});
    metrics.publishStoredMetrics();
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ processed }),
  };
}
