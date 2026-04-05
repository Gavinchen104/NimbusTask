import { z } from "zod";
export declare const taskStatusSchema: z.ZodEnum<["todo", "in_progress", "done", "blocked"]>;
export declare const createProjectSchema: z.ZodObject<{
    teamId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    teamId: string;
    description?: string | undefined;
}, {
    name: string;
    teamId: string;
    description?: string | undefined;
}>;
export declare const createTeamSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const createTaskSchema: z.ZodObject<{
    projectId: z.ZodString;
    title: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<["todo", "in_progress", "done", "blocked"]>>;
    assigneeUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    projectId: string;
    title: string;
    metadata?: Record<string, unknown> | undefined;
    status?: "todo" | "in_progress" | "done" | "blocked" | undefined;
    assigneeUserId?: string | null | undefined;
}, {
    projectId: string;
    title: string;
    metadata?: Record<string, unknown> | undefined;
    status?: "todo" | "in_progress" | "done" | "blocked" | undefined;
    assigneeUserId?: string | null | undefined;
}>;
export declare const patchTaskSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["todo", "in_progress", "done", "blocked"]>>;
    assigneeUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, unknown> | undefined;
    status?: "todo" | "in_progress" | "done" | "blocked" | undefined;
    title?: string | undefined;
    assigneeUserId?: string | null | undefined;
}, {
    metadata?: Record<string, unknown> | undefined;
    status?: "todo" | "in_progress" | "done" | "blocked" | undefined;
    title?: string | undefined;
    assigneeUserId?: string | null | undefined;
}>, {
    metadata?: Record<string, unknown> | undefined;
    status?: "todo" | "in_progress" | "done" | "blocked" | undefined;
    title?: string | undefined;
    assigneeUserId?: string | null | undefined;
}, {
    metadata?: Record<string, unknown> | undefined;
    status?: "todo" | "in_progress" | "done" | "blocked" | undefined;
    title?: string | undefined;
    assigneeUserId?: string | null | undefined;
}>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
//# sourceMappingURL=schemas.d.ts.map