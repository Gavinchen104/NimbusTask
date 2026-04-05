/**
 * Lists indexes on the `tasks` collection (Atlas monitoring helper).
 * Usage: MONGODB_URI=... npx tsx scripts/mongo-index-stats.ts
 */
import { MongoClient } from "mongodb";

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Set MONGODB_URI");
    process.exit(1);
  }
  const dbName = process.env.MONGO_DB_NAME ?? "nimbustask";
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const coll = client.db(dbName).collection("tasks");
    const indexes = await coll.indexes();
    console.log(JSON.stringify(indexes, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
