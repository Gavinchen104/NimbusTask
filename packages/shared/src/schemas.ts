import { z } from "zod";

export const taskStatusSchema = z.enum(["todo", "in_progress", "done", "blocked"]);

export const createProjectSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
});

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(500),
  status: taskStatusSchema.optional(),
  assigneeUserId: z.string().min(1).max(128).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const patchTaskSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    status: taskStatusSchema.optional(),
    assigneeUserId: z.string().min(1).max(128).nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
