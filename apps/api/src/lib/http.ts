import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export function json(
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function parseJson(raw: string | undefined): unknown {
  if (!raw || raw === "") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { statusCode: 400 });
  }
}
