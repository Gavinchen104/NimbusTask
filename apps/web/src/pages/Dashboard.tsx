import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, parseJson } from "../api";
import { useAuth } from "../auth/AuthContext";

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
  status: string;
  assigneeUserId: string | null;
  createdAt: string;
  updatedAt: string;
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
  const [taskTitle, setTaskTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    const res = await apiFetch("/teams", { idToken });
    if (!res.ok) throw new Error(await res.text());
    const data = await parseJson<{ teams: Team[] }>(res);
    setTeams(data.teams);
  }, [idToken]);

  const loadProjects = useCallback(async () => {
    const res = await apiFetch("/projects", { idToken });
    if (!res.ok) throw new Error(await res.text());
    const data = await parseJson<{ projects: Project[] }>(res);
    setProjects(data.projects);
  }, [idToken]);

  const loadTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    const res = await apiFetch(
      `/tasks?projectId=${encodeURIComponent(projectId)}`,
      { idToken }
    );
    if (!res.ok) throw new Error(await res.text());
    const data = await parseJson<{ tasks: Task[] }>(res);
    setTasks(data.tasks);
  }, [idToken, projectId]);

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
    setTeamName("");
    setMessage("Team created");
    await loadTeams();
    await loadProjects();
  }

  async function createProject(e: FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setErr(null);
    const res = await apiFetch("/projects", {
      method: "POST",
      idToken,
      body: JSON.stringify({ teamId, name: projectName.trim() }),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    setProjectName("");
    setMessage("Project created");
    await loadProjects();
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setErr(null);
    const res = await apiFetch("/tasks", {
      method: "POST",
      idToken,
      body: JSON.stringify({ projectId, title: taskTitle.trim() }),
    });
    if (!res.ok) {
      setErr(await res.text());
      return;
    }
    setTaskTitle("");
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
          <form onSubmit={createProject} className="inline">
            <input
              placeholder="New project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={!teamId}
            />
            <button type="submit" disabled={!teamId}>
              Add
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
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel wide">
          <h2>Tasks</h2>
          <form onSubmit={createTask} className="inline">
            <input
              placeholder="Task title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              disabled={!projectId}
            />
            <button type="submit" disabled={!projectId}>
              Add task
            </button>
          </form>
          <ul className="tasks">
            {tasks.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.title}</strong>
                  <span className="muted"> · {t.status}</span>
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
