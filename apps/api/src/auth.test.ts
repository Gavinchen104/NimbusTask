import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { resolveAuth } from "./auth.js";

function minimalEvent(opts: {
  headers?: Record<string, string>;
  authorizerJwt?: Record<string, string>;
}): APIGatewayProxyEventV2 {
  const headers = opts.headers ?? {};
  const requestContext = {
    accountId: "x",
    apiId: "x",
    domainName: "x",
    domainPrefix: "x",
    http: {
      method: "GET",
      path: "/x",
      protocol: "HTTP/1.1",
      sourceIp: "127.0.0.1",
      userAgent: "test",
    },
    requestId: "1",
    routeKey: "GET /x",
    stage: "$default",
    time: new Date().toISOString(),
    timeEpoch: Date.now(),
    authorizer: opts.authorizerJwt
      ? { jwt: { claims: opts.authorizerJwt } }
      : undefined,
  } as APIGatewayProxyEventV2["requestContext"];

  return {
    version: "2.0",
    routeKey: "GET /x",
    rawPath: "/x",
    headers,
    requestContext,
  };
}

describe("resolveAuth", () => {
  it("returns dev user when DEV_LOCAL_AUTH and X-Dev-User-Id", () => {
    const auth = resolveAuth(
      minimalEvent({
        headers: { "x-dev-user-id": "sub-123", "x-dev-user-email": "a@b.co" },
      }),
      true
    );
    assert.equal(auth?.userId, "sub-123");
    assert.equal(auth?.email, "a@b.co");
  });

  it("returns null for dev mode without header", () => {
    const auth = resolveAuth(minimalEvent({ headers: {} }), true);
    assert.equal(auth, null);
  });

  it("reads Cognito JWT claims when present", () => {
    const auth = resolveAuth(
      minimalEvent({
        headers: {},
        authorizerJwt: { sub: "cognito-sub", email: "user@example.com" },
      }),
      false
    );
    assert.equal(auth?.userId, "cognito-sub");
    assert.equal(auth?.email, "user@example.com");
  });

  it("returns null without claims", () => {
    const auth = resolveAuth(minimalEvent({ headers: {} }), false);
    assert.equal(auth, null);
  });
});
