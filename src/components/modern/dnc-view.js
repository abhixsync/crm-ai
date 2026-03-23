"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";

const SOURCE_COLORS = {
  MANUAL: "#4f9cf9",
  IMPORT: "#f5a623",
  CUSTOMER_REQUEST: "#22c993",
  REGULATORY: "#f25858",
  AI_DETECTED: "#a78bfa",
};

function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function isExpired(date) {
  if (!date) return false;
  return new Date(date) < new Date();
}

export function ModernDncView({ user, initialEntries = [] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ phone: "", reason: "", source: "MANUAL" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) => e.phone.includes(q) || (e.reason || "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  async function addEntry(ev) {
    ev.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/dnc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add entry");
        toast.error(data.error || "Failed to add entry");
      } else {
        setEntries((prev) => [data.entry, ...prev]);
        setShowForm(false);
        setForm({ phone: "", reason: "", source: "MANUAL" });
        toast.success("DNC entry added");
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id) {
    const res = await fetch(`/api/admin/dnc/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Entry removed");
    } else {
      toast.error("Failed to remove entry");
    }
  }

  const activeCount = entries.filter((e) => !isExpired(e.expiresAt)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div
        className="ms-card"
        style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>DNC Registry</div>
          <div style={{ fontSize: 12, color: "var(--ms-text3)", marginTop: 2 }}>
            {activeCount} active entries · {entries.length} total
          </div>
        </div>
        <button className="ms-btn ms-btn-pri" onClick={() => setShowForm(true)}>
          + Add Number
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="ms-card" style={{ padding: 24, maxWidth: 460 }}>
          <span className="ms-card-title" style={{ marginBottom: 16, display: "block" }}>
            Add to DNC
          </span>
          <form onSubmit={addEntry} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              className="ms-input"
              type="tel"
              placeholder="+1 555 000 0000"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              required
            />
            <select
              className="ms-input"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            >
              <option value="MANUAL">Manual</option>
              <option value="IMPORT">Import</option>
              <option value="CUSTOMER_REQUEST">Customer request</option>
              <option value="REGULATORY">Regulatory</option>
              <option value="AI_DETECTED">AI detected</option>
            </select>
            <input
              className="ms-input"
              placeholder="Reason (optional)"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(242,88,88,.12)",
                  color: "#f25858",
                  borderRadius: 7,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="ms-btn ms-btn-pri" disabled={saving}>
                {saving ? "Saving…" : "Add to DNC"}
              </button>
              <button type="button" className="ms-btn" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Registry</span>
          <input
            className="ms-input"
            placeholder="Search phone or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "min(220px, 100%)", fontSize: 13 }}
          />
        </div>
        {filtered.length === 0 ? (
          <div className="ms-empty">No DNC entries found.</div>
        ) : (
          <div className="ms-tbl-wrap"><table className="ms-tbl">
            <thead>
              <tr>
                <th>Phone</th>
                <th>Source</th>
                <th>Reason</th>
                <th>Added by</th>
                <th>Expires</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const color = SOURCE_COLORS[e.source] || "#6b7280";
                const expired = isExpired(e.expiresAt);
                return (
                  <tr key={e.id} style={{ opacity: expired ? 0.5 : 1 }}>
                    <td style={{ fontFamily: "monospace", fontWeight: 500 }}>{e.phone}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${color}18`, color }}>
                        {e.source || "MANUAL"}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ms-text2)", maxWidth: 200 }}>
                      {e.reason || "—"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ms-text3)" }}>{e.addedBy?.name || "System"}</td>
                    <td
                      style={{
                        fontSize: 13,
                        color: expired ? "#f25858" : "var(--ms-text3)",
                      }}
                    >
                      {expired ? "Expired" : formatDate(e.expiresAt)}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{formatDate(e.createdAt)}</td>
                    <td>
                      <button
                        className="ms-btn ms-btn-xs ms-btn-danger"
                        onClick={() => removeEntry(e.id)}
                      >
                        Remove
                      </button>
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
