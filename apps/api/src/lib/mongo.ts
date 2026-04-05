import { MongoClient, type Db } from "mongodb";
import { loadConfig } from "./config.js";
import { getMongoUri } from "./secrets.js";

let client: MongoClient | null = null;
let database: Db | null = null;

export async function getMongoDb(): Promise<Db> {
  if (database) return database;
  const config = loadConfig();
  let uri: string;
  if (process.env.MONGODB_URI) {
    uri = process.env.MONGODB_URI;
  } else if (config.mongoSecretArn) {
    uri = await getMongoUri(config.mongoSecretArn);
  } else {
    throw new Error("MONGODB_URI or MONGO_SECRET_ARN required");
  }
  client = new MongoClient(uri);
  await client.connect();
  database = client.db(config.mongoDbName);
  return database;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}
