import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});

let postgresCache: { connectionString: string } | null = null;
let mongoCache: { uri: string } | null = null;

export async function getPostgresConnectionString(secretArn: string): Promise<string> {
  if (postgresCache) return postgresCache.connectionString;
  const raw = await fetchSecret(secretArn);
  const parsed = JSON.parse(raw) as { connectionString?: string; host?: string };
  if (parsed.connectionString) {
    postgresCache = { connectionString: parsed.connectionString };
    return postgresCache.connectionString;
  }
  const proxyHost = process.env.POSTGRES_PROXY_HOST;
  if (parsed.host || proxyHost) {
    const p = parsed as {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      dbname?: string;
    };
    const host = proxyHost ?? p.host;
    if (!host) throw new Error("Postgres host missing");
    const port = p.port ?? 5432;
    const user = encodeURIComponent(p.username ?? "");
    const pass = encodeURIComponent(p.password ?? "");
    const db = p.dbname ?? "nimbustask";
    postgresCache = {
      connectionString: `postgresql://${user}:${pass}@${host}:${port}/${db}`,
    };
    return postgresCache.connectionString;
  }
  throw new Error("Postgres secret must include connectionString or host fields");
}

export async function getMongoUri(secretArn: string): Promise<string> {
  if (mongoCache) return mongoCache.uri;
  const raw = await fetchSecret(secretArn);
  const parsed = JSON.parse(raw) as { uri?: string };
  if (parsed.uri) {
    mongoCache = { uri: parsed.uri };
    return mongoCache.uri;
  }
  throw new Error("Mongo secret must include uri");
}

async function fetchSecret(secretArn: string): Promise<string> {
  const out = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  if (out.SecretString) return out.SecretString;
  if (out.SecretBinary) {
    return Buffer.from(out.SecretBinary).toString("utf8");
  }
  throw new Error("Empty secret");
}

export function resetSecretCache(): void {
  postgresCache = null;
  mongoCache = null;
}
