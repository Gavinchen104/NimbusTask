/**
 * Local HTTP server for development. Set DATABASE_URL, MONGODB_URI, DEV_LOCAL_AUTH=true.
 * Send header X-Dev-User-Id (and optional X-Dev-User-Email) instead of Cognito JWT.
 */
import http from "node:http";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { lambdaHandler } from "./handler.js";

const port = Number(process.env.PORT ?? "3000");

function buildEvent(
  method: string,
  url: URL,
  rawBody: string | undefined,
  headers: http.IncomingHttpHeaders
): APIGatewayProxyEventV2 {
  const h: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    h[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }

  const qs = url.searchParams;
  const queryStringParameters =
    qs.size > 0 ? Object.fromEntries(qs.entries()) : undefined;

  return {
    version: "2.0",
    routeKey: `${method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.search.replace(/^\?/, ""),
    headers: h,
    queryStringParameters,
    body: rawBody && rawBody.length > 0 ? rawBody : undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: h["user-agent"] ?? "dev",
      },
      requestId: `local-${Date.now()}`,
      routeKey: `${method} ${url.pathname}`,
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  } as APIGatewayProxyEventV2;
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  const host = req.headers.host ?? `localhost:${port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);

  process.env.DEV_LOCAL_AUTH = "true";

  const event = buildEvent(req.method ?? "GET", url, rawBody, req.headers);
  const context: Context = {
    awsRequestId: `local-${Date.now()}`,
    functionName: "local",
    functionVersion: "1",
    invokedFunctionArn: "arn:aws:lambda:local:0:function:local",
    memoryLimitInMB: "512",
    logGroupName: "/local",
    logStreamName: "local",
    getRemainingTimeInMillis: () => 30000,
    callbackWaitsForEmptyEventLoop: false,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  const result = await lambdaHandler(event, context);

  res.statusCode = result.statusCode ?? 500;
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      if (v !== undefined) res.setHeader(k, String(v));
    }
  }
  res.end(result.body ?? "");
});

server.listen(port, () => {
  console.error(`NimbusTask API dev server listening on http://localhost:${port}`);
});
