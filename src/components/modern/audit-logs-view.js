"use client";

import { useState, useMemo } from "react";

const ACTION_COLORS = {
  CREATE: "#22c993",
  UPDATE: "#4f9cf9",
  DELETE: "#f25858",
  LOGIN: "#a78bfa",
  LOGOUT: "#6b7280",
  EXPORT: "#f5a623",
  IMPORT: "#f5a623",
};

function formatTime(date) {
  if (!date) return "";
  return new Date(date).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ROLE_COLORS = {
  SUPER_ADMIN: "#f25858",
  ADMIN: "#a78bfa",
  MANAGER: "#4f9cf9",
  SALES: "#22c993",
};

export function ModernAuditLogsView({ user, initialLogs = [] }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const actions = useMemo(() => {
    const set = new Set(initialLogs.map((l) => l.action?.split(":")[0]).filter(Boolean));
    return ["", ...Array.from(set)];
  }, [initialLogs]);

  const filtered = useMemo(() => {
    return initialLogs.filter((log) => {
      if (actionFilter && !log.action?.startsWith(actionFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          log.action?.toLowerCase().includes(q) ||
          log.actor?.name?.toLowerCase().includes(q) ||
          log.targetUser?.name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialLogs, actionFilter, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Audit Logs</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              className="ms-input"
              placeholder="Search action, user, entity…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 220, fontSize: 13 }}
            />
            <select
              className="ms-input"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{ fontSize: 13 }}
            >
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a || "All actions"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="ms-empty">No audit logs match your search.</div>
        ) : (
          <table className="ms-tbl">
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Target</th>
                <th>IP</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const actionBase = log.action?.split(":")[0] || log.action || "";
                const color = ACTION_COLORS[actionBase] || "#6b7280";
                const roleColor = ROLE_COLORS[log.actor?.role] || "#6b7280";
                return (
                  <tr key={log.id}>
                    <td>
                      <span className="ms-bdg" style={{ background: `${color}18`, color }}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{log.actor?.name || "System"}</div>
                      {log.actor?.role && (
                        <div style={{ fontSize: 11, color: roleColor }}>{log.actor.role}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ms-text2)" }}>
                      {log.targetUser
                        ? <span>{log.targetUser.name}</span>
                        : <span style={{ color: "var(--ms-text3)" }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)", fontFamily: "monospace" }}>
                      {log.ipAddress || "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{formatTime(log.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ padding: "10px 20px", fontSize: 12, color: "var(--ms-text3)", borderTop: "1px solid var(--ms-border)" }}>
          Showing {filtered.length} of {initialLogs.length} entries (last 200)
        </div>
      </div>
    </div>
  );
}
