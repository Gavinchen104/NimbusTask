import type { APIGatewayProxyEventV2 } from "aws-lambda";

export interface AuthContext {
  userId: string;
  email?: string;
}

export function resolveAuth(
  event: APIGatewayProxyEventV2,
  devLocalAuth: boolean
): AuthContext | null {
  if (devLocalAuth) {
    const sub = event.headers["x-dev-user-id"] ?? event.headers["X-Dev-User-Id"];
    if (sub) {
      return {
        userId: sub,
        email: event.headers["x-dev-user-email"] ?? event.headers["X-Dev-User-Email"],
      };
    }
  }
  const rc = event.requestContext as typeof event.requestContext & {
    authorizer?: { jwt?: { claims?: Record<string, string> } };
  };
  const claims = rc.authorizer?.jwt?.claims;
  if (!claims) return null;
  const sub = claims.sub;
  if (!sub) return null;
  return {
    userId: sub,
    email: claims.email,
  };
}
