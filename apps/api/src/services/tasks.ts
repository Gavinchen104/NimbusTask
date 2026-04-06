import { randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";
import type {
  CreateTaskInput,
  PatchTaskInput,
  TaskDoc,
  TaskPriority,
  TaskStatus,
} from "@nimbustask/shared";

const TASKS = "tasks";

function tasksCollection(db: Db): Collection<TaskDoc> {
  return db.collection<TaskDoc>(TASKS);
}

export async function ensureTaskIndexes(db: Db): Promise<void> {
  const c = tasksCollection(db);
  await c.createIndex({ projectId: 1, status: 1 });
  await c.createIndex({ projectId: 1, dueDate: 1 });
  await c.createIndex({ projectId: 1, priority: 1 });
  await c.createIndex({ assigneeUserId: 1, status: 1 });
  await c.createIndex({ updatedAt: -1 });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ListTasksOptions {
  status?: TaskStatus;
  /** Case-insensitive search on title and description */
  q?: string;
  limit?: number;
}

export async function createTask(
  db: Db,
  input: CreateTaskInput,
  _userId: string
): Promise<TaskDoc> {
  const now = new Date();
  const doc: TaskDoc = {
    _id: randomUUID(),
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    status: (input.status ?? "todo") as TaskStatus,
    priority: (input.priority ?? "medium") as TaskPriority,
    dueDate: input.dueDate,
    assigneeUserId: input.assigneeUserId ?? null,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };
  await tasksCollection(db).insertOne(doc);
  return doc;
}

export async function listTasksByProject(
  db: Db,
  projectId: string,
  options: ListTasksOptions = {}
): Promise<TaskDoc[]> {
  const limit = options.limit ?? 100;
  const filter: Record<string, unknown> = { projectId };
  if (options.status) {
    filter.status = options.status;
  }
  if (options.q?.trim()) {
    const rx = new RegExp(escapeRegex(options.q.trim()), "i");
    filter.$or = [{ title: rx }, { description: rx }];
  }
  const rows = await tasksCollection(db)
    .find(filter)
    .limit(500)
    .toArray();
  rows.sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return rows.slice(0, limit);
}

export async function getTask(db: Db, id: string): Promise<TaskDoc | null> {
  return tasksCollection(db).findOne({ _id: id });
}

export async function updateTask(
  db: Db,
  id: string,
  patch: PatchTaskInput
): Promise<TaskDoc | null> {
  const existing = await getTask(db, id);
  if (!existing) return null;
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) set[k] = v;
  }
  await tasksCollection(db).updateOne({ _id: id }, { $set: set });
  return getTask(db, id);
}

export async function deleteTask(db: Db, id: string): Promise<boolean> {
  const res = await tasksCollection(db).deleteOne({ _id: id });
  return res.deletedCount === 1;
}
