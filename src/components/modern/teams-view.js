"use client";

import { useState } from "react";

const ROLE_COLORS = {
  SUPER_ADMIN: "#f25858",
  ADMIN: "#a78bfa",
  MANAGER: "#4f9cf9",
  SALES: "#22c993",
};

export function ModernTeamsView({ user, initialTeams = [], availableUsers = [] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", leadId: "" });
  const [saving, setSaving] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [addMemberTeamId, setAddMemberTeamId] = useState(null);
  const [addMemberId, setAddMemberId] = useState("");

  async function createTeam(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setTeams((prev) => [data.team, ...prev]);
        setShowForm(false);
        setForm({ name: "", leadId: "" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function addMember(teamId) {
    if (!addMemberId) return;
    const res = await fetch(`/api/admin/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addMemberId }),
    });
    const data = await res.json();
    if (res.ok) {
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId ? { ...t, members: [...(t.members || []), data.member] } : t
        )
      );
      setAddMemberId("");
      setAddMemberTeamId(null);
    }
  }

  async function removeMember(teamId, userId) {
    const res = await fetch(`/api/admin/teams/${teamId}/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId
            ? { ...t, members: t.members.filter((m) => m.userId !== userId) }
            : t
        )
      );
    }
  }

  async function deleteTeam(id) {
    const res = await fetch(`/api/admin/teams/${id}`, { method: "DELETE" });
    if (res.ok) setTeams((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div
        className="ms-card"
        style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>Teams ({teams.length})</div>
        <button className="ms-btn ms-btn-pri" onClick={() => setShowForm(true)}>
          + New Team
        </button>
      </div>

      {/* New team form */}
      {showForm && (
        <div className="ms-card" style={{ padding: 24, maxWidth: 420 }}>
          <span className="ms-card-title" style={{ marginBottom: 16, display: "block" }}>
            New Team
          </span>
          <form onSubmit={createTeam} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              className="ms-input"
              placeholder="Team name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <select
              className="ms-input"
              value={form.leadId}
              onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))}
            >
              <option value="">— No team lead —</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="ms-btn ms-btn-pri" disabled={saving}>
                {saving ? "Saving…" : "Create team"}
              </button>
              <button type="button" className="ms-btn" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teams list */}
      {teams.length === 0 ? (
        <div className="ms-card">
          <div className="ms-empty">No teams yet. Create your first team above.</div>
        </div>
      ) : (
        teams.map((team) => {
          const isExpanded = expandedTeam === team.id;
          return (
            <div key={team.id} className="ms-card">
              <div
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
                onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{team.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ms-text3)", marginTop: 2 }}>
                    {team.members?.length || 0} members
                    {team.lead && ` · Lead: ${team.lead.name}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--ms-text3)",
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform .2s",
                    }}
                  >
                    ▾
                  </span>
                  <button
                    className="ms-btn ms-btn-xs ms-btn-danger"
                    onClick={(e) => { e.stopPropagation(); deleteTeam(team.id); }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--ms-border)", padding: "16px 20px" }}>
                  {/* Members */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    {(team.members || []).map((m) => {
                      const roleColor = ROLE_COLORS[m.user?.role] || "#6b7280";
                      return (
                        <div
                          key={m.userId}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                        >
                          <div>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{m.user?.name}</span>
                            <span
                              className="ms-bdg"
                              style={{ background: `${roleColor}18`, color: roleColor, marginLeft: 8 }}
                            >
                              {m.user?.role}
                            </span>
                          </div>
                          <button
                            className="ms-btn ms-btn-xs ms-btn-danger"
                            onClick={() => removeMember(team.id, m.userId)}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                    {(team.members || []).length === 0 && (
                      <div style={{ fontSize: 13, color: "var(--ms-text3)" }}>No members yet.</div>
                    )}
                  </div>

                  {/* Add member */}
                  {addMemberTeamId === team.id ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        className="ms-input"
                        value={addMemberId}
                        onChange={(e) => setAddMemberId(e.target.value)}
                        style={{ flex: 1, fontSize: 13 }}
                      >
                        <option value="">— Select user —</option>
                        {availableUsers
                          .filter((u) => !(team.members || []).find((m) => m.userId === u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </option>
                          ))}
                      </select>
                      <button className="ms-btn ms-btn-pri" onClick={() => addMember(team.id)}>
                        Add
                      </button>
                      <button className="ms-btn" onClick={() => { setAddMemberTeamId(null); setAddMemberId(""); }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="ms-btn"
                      style={{ fontSize: 13 }}
                      onClick={() => setAddMemberTeamId(team.id)}
                    >
                      + Add member
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
