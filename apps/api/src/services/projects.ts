import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CreateProjectInput } from "@nimbustask/shared";
import { assertTeamMember } from "./teams.js";

export async function createProject(
  db: NodePgDatabase<typeof schema>,
  userId: string,
  input: CreateProjectInput
) {
  await assertTeamMember(db, input.teamId, userId);
  const [project] = await db
    .insert(schema.projects)
    .values({
      teamId: input.teamId,
      name: input.name,
      description: input.description ?? null,
    })
    .returning();
  if (!project) throw new Error("Failed to create project");
  return project;
}

export async function listProjectsForUser(
  db: NodePgDatabase<typeof schema>,
  userId: string
) {
  const rows = await db
    .select({ project: schema.projects })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .innerJoin(schema.projects, eq(schema.projects.teamId, schema.teams.id))
    .where(eq(schema.teamMembers.userId, userId));
  return rows.map((r) => r.project);
}

export async function getProjectIfMember(
  db: NodePgDatabase<typeof schema>,
  projectId: string,
  userId: string
) {
  const rows = await db
    .select({ project: schema.projects })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .innerJoin(schema.projects, eq(schema.projects.teamId, schema.teams.id))
    .where(eq(schema.teamMembers.userId, userId));

  return rows.map((r) => r.project).find((p) => p.id === projectId) ?? null;
}
