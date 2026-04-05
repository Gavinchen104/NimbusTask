export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

export interface TaskDoc {
  _id?: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  assigneeUserId: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
