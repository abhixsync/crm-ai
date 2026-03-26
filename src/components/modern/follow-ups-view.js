"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";

const PRIORITY_COLORS = {
  HIGH: "var(--ms-red, #f25858)",
  MEDIUM: "var(--ms-amber, #f5a623)",
  LOW: "var(--ms-blue, #4f9cf9)",
};

const STATUS_COLORS = {
  PENDING: "var(--ms-amber, #f5a623)",
  IN_PROGRESS: "var(--ms-blue, #4f9cf9)",
  COMPLETED: "var(--ms-green, #22c993)",
  CANCELLED: "var(--ms-muted, #6b7280)",
};

function formatDate(date) {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - now) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function isOverdue(date) {
  if (!date) return false;
  return new Date(date) < new Date();
}

const FILTER_CHIPS = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
];

export function ModernFollowUpsView({ user, initialTasks = [] }) {
  const [filter, setFilter] = useState("PENDING");
  const [tasks, setTasks] = useState(initialTasks);
  const [completing, setCompleting] = useState(null);

  const filtered = useMemo(() => {
    if (!filter) return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const overdueCount = tasks.filter(
    (t) => t.status === "PENDING" && isOverdue(t.dueDate)
  ).length;

  async function markComplete(id) {
    if (completing === id) return;
    setCompleting(id);
    try {
      const res = await fetch(`/api/admin/follow-ups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "COMPLETED" } : t)));
        toast.success("Task marked complete");
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to update task");
      }
    } catch {
      toast.error("Failed to update task");
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-card">
        <div className="ms-card-hd">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ms-card-title">Follow-up Tasks</span>
            {overdueCount > 0 && (
              <span className="ms-bdg ms-bdg-danger">
                {overdueCount} overdue
              </span>
            )}
          </div>
          <div className="ms-chips">
            {FILTER_CHIPS.map(({ label, value }) => (
              <button
                key={value}
                className={`ms-chip${filter === value ? " active" : ""}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="ms-empty">No tasks match this filter.</div>
        ) : (
          <div className="ms-tbl-wrap"><table className="ms-tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Task</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Assigned to</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const priColor = PRIORITY_COLORS[t.priority] || "#6b7280";
                const stColor = STATUS_COLORS[t.status] || "#6b7280";
                const overdue = t.status === "PENDING" && isOverdue(t.dueDate);
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {t.customer
                          ? `${t.customer.firstName || ""} ${t.customer.lastName || ""}`.trim()
                          : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ms-text3)" }}>{t.customer?.phone}</div>
                    </td>
                    <td style={{ maxWidth: 200, fontSize: 13, color: "var(--ms-text2)" }}>
                      {t.notes || t.taskType || "—"}
                    </td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${priColor}18`, color: priColor }}>
                        {t.priority || "MEDIUM"}
                      </span>
                    </td>
                    <td
                      style={{
                        fontSize: 13,
                        color: overdue ? "var(--ms-red, #f25858)" : "var(--ms-text2)",
                        fontWeight: overdue ? 600 : 400,
                      }}
                    >
                      {formatDate(t.dueDate)}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ms-text2)" }}>
                      {t.assignedTo?.name || "Unassigned"}
                    </td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${stColor}18`, color: stColor }}>
                        {t.status}
                      </span>
                    </td>
                    <td>
                      {t.status === "PENDING" && (
                        <button
                          className="ms-btn ms-btn-xs ms-btn-pri"
                          onClick={() => markComplete(t.id)}
                          disabled={completing === t.id}
                          aria-label="Mark task complete"
                        >
                          {completing === t.id ? "…" : "Done"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
