"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

const INTENT_TYPES = [
  { value: "INTERESTED", label: "Interested", color: "#22c993" },
  { value: "NOT_INTERESTED", label: "Not interested", color: "#f25858" },
  { value: "CALLBACK", label: "Call back later", color: "#f5a623" },
  { value: "DO_NOT_CALL", label: "Do not call", color: "#6b7280" },
  { value: "MORE_INFO", label: "Wants more info", color: "#4f9cf9" },
];

export function ModernIntentTrainingView({ user }) {
  const [intents, setIntents] = useState([]);
  const [phrase, setPhrase] = useState("");
  const [intentType, setIntentType] = useState("INTERESTED");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/intent-training")
      .then((r) => r.json())
      .then((d) => setIntents(d.intents || []))
      .catch(() => {});
  }, []);

  async function addPhrase(e) {
    e.preventDefault();
    if (!phrase.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/intent-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: phrase.trim(), intentType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        toast.error(data.error || "Failed to save phrase");
      } else {
        setIntents((prev) => [data.intent, ...prev]);
        setPhrase("");
        toast.success("Phrase added");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePhrase(id) {
    const res = await fetch(`/api/admin/intent-training/${id}`, { method: "DELETE" });
    if (res.ok) {
      setIntents((prev) => prev.filter((i) => i.id !== id));
      toast.success("Phrase removed");
    } else {
      toast.error("Failed to remove phrase");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Add form */}
      <div className="ms-card" style={{ maxWidth: "min(560px, 100%)" }}>
        <div className="ms-card-hd">
          <span className="ms-card-title">Intent Training Phrases</span>
        </div>
        <form onSubmit={addPhrase} style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "var(--ms-text2)" }}>Example phrase</label>
            <input
              className="ms-input"
              placeholder="e.g. yes I am interested in this"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "var(--ms-text2)" }}>Intent</label>
            <select
              className="ms-input"
              value={intentType}
              onChange={(e) => setIntentType(e.target.value)}
            >
              {INTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
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
          <button
            type="submit"
            className="ms-btn ms-btn-pri"
            disabled={saving || !phrase.trim()}
          >
            {saving ? "Saving…" : "Add phrase"}
          </button>
        </form>
      </div>

      {/* Phrases table */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Training Data</span>
          <span style={{ fontSize: 13, color: "var(--ms-text3)" }}>{intents.length} phrases</span>
        </div>
        {intents.length === 0 ? (
          <div className="ms-empty">No training phrases yet. Add examples above.</div>
        ) : (
          <div className="ms-tbl-wrap"><table className="ms-tbl">
            <thead>
              <tr>
                <th>Phrase</th>
                <th>Intent</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {intents.map((i) => {
                const intentDef = INTENT_TYPES.find((t) => t.value === i.intentType);
                const color = intentDef?.color || "#6b7280";
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{i.phrase}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${color}18`, color }}>
                        {intentDef?.label || i.intentType}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>
                      {i.createdAt ? new Date(i.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <button
                        className="ms-btn ms-btn-xs ms-btn-danger"
                        onClick={() => deletePhrase(i.id)}
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
