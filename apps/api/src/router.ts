import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  createProjectSchema,
  createTaskSchema,
  createTeamSchema,
  patchTaskSchema,
} from "@nimbustask/shared";
import { ZodError } from "zod";
import type { Logger } from "@aws-lambda-powertools/logger";
import type { Metrics } from "@aws-lambda-powertools/metrics";
import { resolveAuth, type AuthContext } from "./auth.js";
import { loadConfig } from "./lib/config.js";
import { json, parseJson } from "./lib/http.js";
import { getDb } from "./lib/pg.js";
import { getMongoDb } from "./lib/mongo.js";
import * as usersService from "./services/users.js";
import * as teamsService from "./services/teams.js";
import * as projectsService from "./services/projects.js";
import * as tasksService from "./services/tasks.js";

const HEALTH: APIGatewayProxyStructuredResultV2 = {
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ status: "ok", service: "nimbustask-api" }),
};

export async function route(
  event: APIGatewayProxyEventV2,
  logger: Logger,
  metrics: Metrics
): Promise<APIGatewayProxyStructuredResultV2> {
  const config = loadConfig();
  const method = event.requestContext.http.method;
  const path = event.rawPath ?? "/";

  if (method === "GET" && path === "/health") {
    return HEALTH;
  }

  if (method === "GET" && path === "/") {
    return json(200, { service: "nimbustask-api", docs: "/health" });
  }

  const auth = resolveAuth(event, config.devLocalAuth);
  if (!auth) {
    return json(401, { error: "Unauthorized" });
  }

  const t0 = Date.now();
  try {
    const result = await dispatch(method, path, event, auth, logger, metrics);
    metrics.addMetric("ApiLatencyMs", "Milliseconds", Date.now() - t0);
    return result;
  } catch (err) {
    metrics.addMetric("ApiErrors", "Count", 1);
    if (err instanceof ZodError) {
      return json(400, { error: "Validation failed", details: err.flatten() });
    }
    const status =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode?: number }).statusCode)
        : 500;
    if (status >= 500) {
      logger.error("Request failed", { err });
    }
    const message =
      status === 500 ? "Internal Server Error" : String((err as Error).message);
    return json(status, { error: message });
  }
}

async function dispatch(
  method: string,
  path: string,
  event: APIGatewayProxyEventV2,
  auth: AuthContext,
  logger: Logger,
  metrics: Metrics
): Promise<APIGatewayProxyStructuredResultV2> {
  const db = await getDb();
  const mongo = await getMongoDb();
  await tasksService.ensureTaskIndexes(mongo);

  const user = await usersService.ensureUser(db, auth.userId, auth.email);

  if (method === "POST" && path === "/teams") {
    const body = createTeamSchema.parse(parseJson(event.body));
    const team = await teamsService.createTeam(db, user.id, body);
    metrics.addMetric("TeamsCreated", "Count", 1);
    return json(201, team);
  }

  if (method === "GET" && path === "/teams") {
    const teams = await teamsService.listTeamsForUser(db, user.id);
    return json(200, { teams });
  }

  if (method === "POST" && path === "/projects") {
    const body = createProjectSchema.parse(parseJson(event.body));
    const project = await projectsService.createProject(db, user.id, body);
    metrics.addMetric("ProjectsCreated", "Count", 1);
    return json(201, project);
  }

  if (method === "GET" && path === "/projects") {
    const projects = await projectsService.listProjectsForUser(db, user.id);
    return json(200, { projects });
  }

  if (method === "POST" && path === "/tasks") {
    const body = createTaskSchema.parse(parseJson(event.body));
    const project = await projectsService.getProjectIfMember(
      db,
      body.projectId,
      user.id
    );
    if (!project) {
      return json(404, { error: "Project not found" });
    }
    const task = await tasksService.createTask(mongo, body, user.id);
    metrics.addMetric("TasksCreated", "Count", 1);
    return json(201, serializeTask(task));
  }

  if (method === "GET" && path === "/tasks") {
    const projectId = event.queryStringParameters?.projectId;
    if (!projectId) {
      return json(400, { error: "projectId query parameter required" });
    }
    const project = await projectsService.getProjectIfMember(
      db,
      projectId,
      user.id
    );
    if (!project) {
      return json(404, { error: "Project not found" });
    }
    const list = await tasksService.listTasksByProject(mongo, projectId);
    return json(200, { tasks: list.map(serializeTask) });
  }

  const taskMatch = /^\/tasks\/([^/]+)$/.exec(path);
  if (taskMatch) {
    const taskId = taskMatch[1]!;
    if (method === "GET") {
      const task = await tasksService.getTask(mongo, taskId);
      if (!task) return json(404, { error: "Task not found" });
      const project = await projectsService.getProjectIfMember(
        db,
        task.projectId,
        user.id
      );
      if (!project) return json(404, { error: "Task not found" });
      return json(200, serializeTask(task));
    }
    if (method === "PATCH") {
      const body = patchTaskSchema.parse(parseJson(event.body));
      const existing = await tasksService.getTask(mongo, taskId);
      if (!existing) return json(404, { error: "Task not found" });
      const project = await projectsService.getProjectIfMember(
        db,
        existing.projectId,
        user.id
      );
      if (!project) return json(404, { error: "Task not found" });
      const updated = await tasksService.updateTask(mongo, taskId, body);
      metrics.addMetric("TasksUpdated", "Count", 1);
      return json(200, serializeTask(updated!));
    }
    if (method === "DELETE") {
      const existing = await tasksService.getTask(mongo, taskId);
      if (!existing) return json(404, { error: "Task not found" });
      const project = await projectsService.getProjectIfMember(
        db,
        existing.projectId,
        user.id
      );
      if (!project) return json(404, { error: "Task not found" });
      await tasksService.deleteTask(mongo, taskId);
      metrics.addMetric("TasksDeleted", "Count", 1);
      return json(204, "");
    }
  }

  logger.warn("No route", { method, path });
  return json(404, { error: "Not found" });
}

function serializeTask(t: {
  _id?: string;
  projectId: string;
  title: string;
  status: string;
  assigneeUserId: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t._id,
    projectId: t.projectId,
    title: t.title,
    status: t.status,
    assigneeUserId: t.assigneeUserId,
    metadata: t.metadata,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
