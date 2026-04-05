import { randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";
import type {
  CreateTaskInput,
  PatchTaskInput,
  TaskDoc,
  TaskStatus,
} from "@nimbustask/shared";

const TASKS = "tasks";

function tasksCollection(db: Db): Collection<TaskDoc> {
  return db.collection<TaskDoc>(TASKS);
}

export async function ensureTaskIndexes(db: Db): Promise<void> {
  const c = tasksCollection(db);
  await c.createIndex({ projectId: 1, status: 1 });
  await c.createIndex({ assigneeUserId: 1, status: 1 });
  await c.createIndex({ updatedAt: -1 });
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
    status: (input.status ?? "todo") as TaskStatus,
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
  limit = 100
): Promise<TaskDoc[]> {
  return tasksCollection(db)
    .find({ projectId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
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
  await tasksCollection(db).updateOne(
    { _id: id },
    { $set: { ...patch, updatedAt: now } }
  );
  return getTask(db, id);
}

export async function deleteTask(db: Db, id: string): Promise<boolean> {
  const res = await tasksCollection(db).deleteOne({ _id: id });
  return res.deletedCount === 1;
}
