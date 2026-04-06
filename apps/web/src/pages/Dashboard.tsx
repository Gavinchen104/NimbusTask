import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, parseJson } from "../api";
import { useAuth } from "../auth/AuthContext";
import { downloadTasksCsv, type TaskRow } from "../exportTasksCsv";

interface Team {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}

interface Project {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDue(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function Dashboard() {
  const { isDev, idToken, email, signOut } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskDue, setTaskDue] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    const res = await apiFetch("/teams", { idToken });
    if (!res.ok) throw new Error(await res.text());
    const data = await parseJson<{ teams?: Team[] }>(res);
    setTeams(data.teams ?? []);
  }, [idToken]);

  const loadProjects = useCallback(async () => {
    const res = await apiFetch("/projects", { idToken });
    if (!res.ok) throw new Error(await res.text());
    const data = await parseJson<{ projects?: Project[] }>(res);
    setProjects(data.projects ?? []);
  }, [idToken]);

  const loadTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    const params = new URLSearchParams({ projectId });
    if (taskStatusFilter) params.set("status", taskStatusFilter);
    if (taskSearch.trim()) params.set("q", taskSearch.trim());
    const res = await apiFetch(`/tasks?${params.toString()}`, { idToken });
    if (!res.ok) throw new Error(await res.text());
    const data = await parseJson<{ tasks?: Task[] }>(res);
    setTasks(data.tasks ?? []);
  }, [idToken, projectId, taskStatusFilter, taskSearch]);

  useEffect(() => {
    setMessage(null);
    setErr(null);
    loadTeams().catch((e: unknown) =>
      setErr(e instanceof Error ? e.message : "Failed to load teams")
    );
  }, [loadTeams]);

  useEffect(() => {
    loadProjects().catch((e: unknown) =>
      setErr(e instanceof Error ? e.message : "Failed to load projects")
    );
  }, [loadProjects]);

  useEffect(() => {
    loadTasks().catch((e: unknown) =>
      setErr(e instanceof Error ? e.message : "Failed to load tasks")
    );
  }, [loadTasks]);

  async function createTeam(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await apiFetch("/teams", {
      method: "POST",
      idToken,
      body: JSON.stringify({ name: teamName.trim() }),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    const created = await parseJson<{ id: string }>(res);
    setTeamId(created.id);
    setProjectId("");
    setTeamName("");
    setMessage("Team created — you can add projects for this team.");
    await loadTeams();
    await loadProjects();
  }

  async function createProject(e: FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setErr(null);
    const body: { teamId: string; name: string; description?: string } = {
      teamId,
      name: projectName.trim(),
    };
    const d = projectDescription.trim();
    if (d) body.description = d;
    const res = await apiFetch("/projects", {
      method: "POST",
      idToken,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    const created = await parseJson<{ id: string }>(res);
    setProjectId(created.id);
    setProjectName("");
    setProjectDescription("");
    setMessage("Project created — you can add tasks for this project.");
    await loadProjects();
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setErr(null);
    const payload: Record<string, unknown> = {
      projectId,
      title: taskTitle.trim(),
      priority: taskPriority,
    };
    const desc = taskDescription.trim();
    if (desc) payload.description = desc;
    if (taskDue) {
      payload.dueDate = new Date(taskDue).toISOString();
    }
    const res = await apiFetch("/tasks", {
      method: "POST",
      idToken,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    setTaskTitle("");
    setTaskDescription("");
    setTaskPriority("medium");
    setTaskDue("");
    setMessage("Task created");
    await loadTasks();
  }

  async function patchTaskStatus(id: string, status: string) {
    setErr(null);
    const res = await apiFetch(`/tasks/${id}`, {
      method: "PATCH",
      idToken,
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    await loadTasks();
  }

  async function patchTaskPriority(id: string, priority: string) {
    setErr(null);
    const res = await apiFetch(`/tasks/${id}`, {
      method: "PATCH",
      idToken,
      body: JSON.stringify({ priority }),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    await loadTasks();
  }

  async function removeTask(id: string) {
    setErr(null);
    const res = await apiFetch(`/tasks/${id}`, {
      method: "DELETE",
      idToken,
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    await loadTasks();
  }

  function handleExportCsv() {
    const proj = projects.find((p) => p.id === projectId);
    const rows: TaskRow[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      description: t.description,
      updatedAt: t.updatedAt,
    }));
    downloadTasksCsv(rows, proj?.name ?? "project");
  }

  const projectsForTeam = teamId
    ? projects.filter((p) => p.teamId === teamId)
    : [];

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>NimbusTask</h1>
          <p className="muted">
            {isDev ? "Dev mode (header auth)" : email ?? "Signed in"}
          </p>
        </div>
        {!isDev && (
          <button type="button" className="ghost" onClick={() => signOut()}>
            Sign out
          </button>
        )}
      </header>

      {message && <p className="success">{message}</p>}
      {err && <p className="error">{err}</p>}

      <section className="grid">
        <div className="panel">
          <h2>Teams</h2>
          <form onSubmit={createTeam} className="inline">
            <input
              placeholder="New team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <button type="submit">Add</button>
          </form>
          <ul className="list">
            {teams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={teamId === t.id ? "active" : ""}
                  onClick={() => {
                    setTeamId(t.id);
                    setProjectId("");
                  }}
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Projects</h2>
          {!teamId && (
            <p className="muted small-hint">
              Create a team, then click it in the list (or create a new team —
              it will be selected automatically).
            </p>
          )}
          <form onSubmit={createProject} className="stack-form">
            <input
              placeholder="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={!teamId}
            />
            <textarea
              placeholder="Description (optional)"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              disabled={!teamId}
              rows={2}
            />
            <button type="submit" disabled={!teamId}>
              Add project
            </button>
          </form>
          <ul className="list">
            {projectsForTeam.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={projectId === p.id ? "active" : ""}
                  onClick={() => setProjectId(p.id)}
                >
                  <span className="proj-line">{p.name}</span>
                  {p.description && (
                    <span className="proj-desc">{p.description}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel wide">
          <h2>Tasks</h2>
          {!projectId && (
            <p className="muted small-hint">
              Select a project in the list above, or create one — it will be
              selected so you can add tasks (requires MongoDB for the API).
            </p>
          )}

          <form onSubmit={createTask} className="stack-form task-create">
            <div className="inline">
              <input
                placeholder="Title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={!projectId}
              />
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                disabled={!projectId}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <textarea
              placeholder="Description (optional)"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              disabled={!projectId}
              rows={2}
            />
            <label className="muted due-label">
              Due
              <input
                type="datetime-local"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                disabled={!projectId}
              />
            </label>
            <button type="submit" disabled={!projectId || !taskTitle.trim()}>
              Add task
            </button>
          </form>

          {projectId && (
            <div className="task-toolbar">
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="todo">todo</option>
                <option value="in_progress">in progress</option>
                <option value="done">done</option>
                <option value="blocked">blocked</option>
              </select>
              <input
                type="search"
                placeholder="Search title or description"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
              />
              <button type="button" className="ghost" onClick={handleExportCsv}>
                Export CSV
              </button>
            </div>
          )}

          <ul className="tasks">
            {tasks.map((t) => (
              <li key={t.id}>
                <div className="task-main">
                  <div>
                    <strong>{t.title}</strong>
                    <span className={`pri pri-${t.priority ?? "medium"}`}>
                      {t.priority ?? "medium"}
                    </span>
                  </div>
                  {t.description && (
                    <p className="task-desc">{t.description}</p>
                  )}
                  <p className="muted task-meta">
                    Due {formatDue(t.dueDate)} · {t.status}
                  </p>
                </div>
                <div className="actions">
                  <select
                    value={t.status}
                    onChange={(e) => patchTaskStatus(t.id, e.target.value)}
                  >
                    <option value="todo">todo</option>
                    <option value="in_progress">in_progress</option>
                    <option value="done">done</option>
                    <option value="blocked">blocked</option>
                  </select>
                  <select
                    value={t.priority ?? "medium"}
                    onChange={(e) => patchTaskPriority(t.id, e.target.value)}
                    title="Priority"
                  >
                    <option value="low">low</option>
                    <option value="medium">med</option>
                    <option value="high">high</option>
                    <option value="urgent">urgent</option>
                  </select>
                  <button type="button" onClick={() => removeTask(t.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
