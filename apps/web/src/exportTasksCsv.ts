/** Download task list as CSV (client-side). */

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
  description?: string;
  updatedAt: string;
}

function escapeCell(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadTasksCsv(
  tasks: TaskRow[],
  filenameBase: string
): void {
  const headers = [
    "id",
    "title",
    "status",
    "priority",
    "due_date",
    "description",
    "updated_at",
  ];
  const lines = [
    headers.join(","),
    ...tasks.map((t) =>
      [
        escapeCell(t.id),
        escapeCell(t.title),
        escapeCell(t.status),
        escapeCell(t.priority ?? ""),
        escapeCell(t.dueDate ?? ""),
        escapeCell(t.description ?? ""),
        escapeCell(t.updatedAt),
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase.replace(/[^a-z0-9-_]/gi, "_")}-tasks.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
