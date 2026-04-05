/** API client for NimbusTask HTTP API (Cognito JWT or dev headers). */

export function getApiConfig(): {
  baseUrl: string;
  dev: boolean;
  devUserId: string;
  devEmail: string;
} {
  const base = import.meta.env.VITE_API_URL;
  if (!base || base.length === 0) {
    throw new Error("Set VITE_API_URL in apps/web/.env");
  }
  const dev = import.meta.env.VITE_DEV_LOCAL_AUTH === "true";
  return {
    baseUrl: base.replace(/\/$/, ""),
    dev,
    devUserId: import.meta.env.VITE_DEV_USER_ID ?? "dev-local-user",
    devEmail: import.meta.env.VITE_DEV_USER_EMAIL ?? "dev@local.test",
  };
}

export async function apiFetch(
  path: string,
  init: RequestInit & { idToken?: string | null } = {}
): Promise<Response> {
  const { baseUrl, dev, devUserId, devEmail } = getApiConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (dev) {
    headers.set("X-Dev-User-Id", devUserId);
    headers.set("X-Dev-User-Email", devEmail);
  } else if (init.idToken) {
    headers.set("Authorization", `Bearer ${init.idToken}`);
  }
  return fetch(url, { ...init, headers });
}

export async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
