import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function ensureUser(
  db: NodePgDatabase<typeof schema>,
  cognitoSub: string,
  email?: string
): Promise<{ id: string }> {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.cognitoSub, cognitoSub))
    .limit(1);
  const row = existing[0];
  if (row) {
    if (email && row.email !== email) {
      await db
        .update(schema.users)
        .set({ email })
        .where(eq(schema.users.id, row.id));
    }
    return { id: row.id };
  }
  const [created] = await db
    .insert(schema.users)
    .values({ cognitoSub, email: email ?? null })
    .returning({ id: schema.users.id });
  if (!created) throw new Error("Failed to create user");
  return { id: created.id };
}
