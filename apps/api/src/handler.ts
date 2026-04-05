import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { route } from "./router.js";

const logger = new Logger({ serviceName: "nimbustask-api" });
const tracer = new Tracer({ serviceName: "nimbustask-api" });
const metrics = new Metrics({
  namespace: "NimbusTask",
  serviceName: "nimbustask-api",
});

export async function lambdaHandler(
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyStructuredResultV2> {
  logger.appendKeys({ requestId: context.awsRequestId });
  tracer.putAnnotation("path", event.rawPath ?? "");

  try {
    const result = await route(event, logger, metrics);
    const code = result.statusCode ?? 500;
    if (code >= 500) {
      metrics.addMetric("Api5xx", MetricUnit.Count, 1);
    } else {
      metrics.addMetric("Api2xx", MetricUnit.Count, 1);
    }
    return result;
  } finally {
    metrics.publishStoredMetrics();
    tracer.annotateColdStart();
  }
}
