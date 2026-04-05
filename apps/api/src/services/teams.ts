import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CreateTeamInput } from "@nimbustask/shared";

export async function createTeam(
  db: NodePgDatabase<typeof schema>,
  userId: string,
  input: CreateTeamInput
) {
  const [team] = await db
    .insert(schema.teams)
    .values({ name: input.name })
    .returning();
  if (!team) throw new Error("Failed to create team");
  await db.insert(schema.teamMembers).values({
    teamId: team.id,
    userId,
    role: "owner",
  });
  return team;
}

export async function listTeamsForUser(
  db: NodePgDatabase<typeof schema>,
  userId: string
) {
  const rows = await db
    .select({
      team: schema.teams,
      role: schema.teamMembers.role,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(eq(schema.teamMembers.userId, userId));
  return rows.map((r) => ({ ...r.team, role: r.role }));
}

export async function assertTeamMember(
  db: NodePgDatabase<typeof schema>,
  teamId: string,
  userId: string
): Promise<void> {
  const rows = await db
    .select()
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, teamId),
        eq(schema.teamMembers.userId, userId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    const err = new Error("Forbidden");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
}
