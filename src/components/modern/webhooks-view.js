"use client";

import { useState } from "react";
import { toast } from "sonner";

const WEBHOOK_EVENTS = [
  "call.completed",
  "call.failed",
  "customer.created",
  "customer.converted",
  "customer.status_changed",
  "deal.created",
  "deal.won",
  "deal.lost",
  "lead.uploaded",
  "follow_up.created",
  "follow_up.completed",
];

function formatTime(date) {
  if (!date) return "";
  return new Date(date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ModernWebhooksView({ user, initialWebhooks = [] }) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", events: [], secret: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [fullLogs, setFullLogs] = useState({}); // webhookId → logs[]
  const [loadingLogs, setLoadingLogs] = useState({});
  const [testingId, setTestingId] = useState("");
  const [retryingLogId, setRetryingLogId] = useState("");

  function toggleEvent(event) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }));
  }

  async function createWebhook(e) {
    e.preventDefault();
    if (form.events.length === 0) { setError("Select at least one event"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create");
        toast.error(data.error || "Failed to create webhook");
      } else {
        setWebhooks((prev) => [{ ...data.webhook, logs: [] }, ...prev]);
        setShowForm(false);
        setForm({ name: "", url: "", events: [], secret: "" });
        toast.success("Webhook created");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(id, enabled) {
    const res = await fetch(`/api/admin/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    if (res.ok) {
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !enabled } : w)));
      toast.success(`Webhook ${enabled ? "disabled" : "enabled"}`);
    } else {
      toast.error("Failed to update webhook");
    }
  }

  async function deleteWebhook(id) {
    const res = await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success("Webhook deleted");
    } else {
      toast.error("Failed to delete webhook");
    }
  }

  async function sendTest(id) {
    setTestingId(id);
    try {
      const res = await fetch(`/api/admin/webhooks/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.log?.success ? "Test delivered successfully!" : `Test failed — HTTP ${data.log?.statusCode || "error"}`);
        // Refresh logs for this webhook
        loadLogs(id, true);
      } else {
        toast.error(data.error || "Test failed");
      }
    } catch { toast.error("Test request failed"); } finally { setTestingId(""); }
  }

  async function loadLogs(id, force = false) {
    if (loadingLogs[id] || (fullLogs[id] && !force)) return;
    setLoadingLogs((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/admin/webhooks/${id}/logs?limit=20`);
      const data = await res.json();
      if (res.ok) setFullLogs((p) => ({ ...p, [id]: data.logs }));
    } finally {
      setLoadingLogs((p) => ({ ...p, [id]: false }));
    }
  }

  async function retryLog(webhookId, logId) {
    setRetryingLogId(logId);
    try {
      const res = await fetch(`/api/admin/webhooks/${webhookId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.log?.success ? "Retry succeeded!" : `Retry failed — HTTP ${data.log?.statusCode || "error"}`);
        loadLogs(webhookId, true);
      } else {
        toast.error(data.error || "Retry failed");
      }
    } catch { toast.error("Retry request failed"); } finally { setRetryingLogId(""); }
  }

  function handleExpand(id) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) loadLogs(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="ms-card" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Webhooks ({webhooks.length})</div>
        <button className="ms-btn ms-btn-pri" onClick={() => setShowForm(true)}>
          + New Webhook
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="ms-card" style={{ padding: "20px 24px" }}>
          <div className="ms-card-title" style={{ marginBottom: 20 }}>New Webhook</div>
          <form onSubmit={createWebhook} className="ms-grid-form-2" style={{ gap: 16 }}>
            <div>
              <label className="ms-field-label">Name</label>
              <input
                className="ms-input"
                placeholder="e.g. Slack notifications"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="ms-field-label">Endpoint URL</label>
              <input
                className="ms-input"
                type="url"
                placeholder="https://your-endpoint.com/webhook"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                required
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="ms-field-label">Signing Secret (optional)</label>
              <input
                className="ms-input"
                placeholder="Used to verify webhook signatures via X-CRM-Signature header"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="ms-field-label">Events to subscribe</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {WEBHOOK_EVENTS.map((ev) => (
                  <label
                    key={ev}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer",
                      padding: "5px 12px", borderRadius: 6,
                      background: form.events.includes(ev) ? "var(--ms-accent-dim)" : "var(--ms-bg3)",
                      border: `1px solid ${form.events.includes(ev) ? "var(--ms-accent)" : "var(--ms-border)"}`,
                      color: form.events.includes(ev) ? "var(--ms-accent-txt)" : "var(--ms-text2)",
                      transition: "all .12s",
                    }}
                  >
                    <input type="checkbox" style={{ display: "none" }} checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
            {error && (
              <div style={{ gridColumn: "1 / -1", padding: "10px 14px", background: "rgba(242,88,88,.12)", color: "#f25858", borderRadius: 7, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, marginTop: 4 }}>
              <button type="submit" className="ms-btn ms-btn-pri" disabled={saving}>
                {saving ? "Saving…" : "Create Webhook"}
              </button>
              <button type="button" className="ms-btn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Webhooks list */}
      {webhooks.length === 0 ? (
        <div className="ms-card">
          <div className="ms-empty">No webhooks configured yet.</div>
        </div>
      ) : (
        webhooks.map((wh) => {
          const isExpanded = expandedId === wh.id;
          const logs = fullLogs[wh.id] || wh.logs || [];
          const successCount = logs.filter((l) => l.success).length;
          const failCount = logs.filter((l) => !l.success).length;
          return (
            <div key={wh.id} className="ms-card">
              <div
                style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}
                onClick={() => handleExpand(wh.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{wh.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ms-text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                    {wh.url}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  {logs.length > 0 && (
                    <>
                      {successCount > 0 && <span style={{ fontSize: 11, color: "#22c993" }}>✓ {successCount}</span>}
                      {failCount > 0 && <span style={{ fontSize: 11, color: "#f25858" }}>✗ {failCount}</span>}
                    </>
                  )}
                  <span className="ms-bdg" style={{ background: wh.enabled ? "rgba(34,201,147,.12)" : "rgba(107,114,128,.12)", color: wh.enabled ? "#22c993" : "#6b7280" }}>
                    {wh.enabled ? "Active" : "Disabled"}
                  </span>
                  <button
                    className="ms-btn ms-btn-xs"
                    onClick={(e) => { e.stopPropagation(); sendTest(wh.id); }}
                    disabled={testingId === wh.id}
                    title="Send test payload"
                  >
                    {testingId === wh.id ? "…" : "Test"}
                  </button>
                  <button
                    className="ms-btn ms-btn-xs"
                    onClick={(e) => { e.stopPropagation(); toggleEnabled(wh.id, wh.enabled); }}
                  >
                    {wh.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="ms-btn ms-btn-xs ms-btn-danger"
                    onClick={(e) => { e.stopPropagation(); deleteWebhook(wh.id); }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--ms-border)", padding: "14px 20px" }}>
                  {/* Subscribed events */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "var(--ms-text3)", marginBottom: 6 }}>Subscribed events</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(wh.events || []).map((ev) => (
                        <span key={ev} className="ms-bdg" style={{ background: "rgba(79,156,249,.12)", color: "#4f9cf9" }}>{ev}</span>
                      ))}
                    </div>
                  </div>

                  {/* Delivery log */}
                  <div>
                    <div style={{ fontSize: 12, color: "var(--ms-text3)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>Delivery log</span>
                      {loadingLogs[wh.id] && <span style={{ fontSize: 10 }}>Loading…</span>}
                    </div>
                    {logs.length === 0 && !loadingLogs[wh.id] ? (
                      <div style={{ fontSize: 12, color: "var(--ms-text3)" }}>No deliveries yet. Click "Test" to send a test payload.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {logs.map((log) => (
                          <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: "var(--ms-bg3)", fontSize: 12 }}>
                            <span style={{ color: log.success ? "#22c993" : "#f25858", fontSize: 14, lineHeight: 1 }}>
                              {log.success ? "✓" : "✗"}
                            </span>
                            <span style={{ color: "var(--ms-text2)", minWidth: 160 }}>{log.event}</span>
                            {log.statusCode && (
                              <span style={{ color: log.success ? "#22c993" : "#f25858", fontWeight: 600, minWidth: 36 }}>
                                {log.statusCode}
                              </span>
                            )}
                            {log.response && (
                              <span style={{ color: "var(--ms-text3)", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {log.response}
                              </span>
                            )}
                            <span style={{ color: "var(--ms-text3)", marginLeft: "auto", whiteSpace: "nowrap", fontSize: 11 }}>
                              {formatTime(log.createdAt)}
                            </span>
                            {!log.success && (
                              <button
                                className="ms-btn ms-btn-xs"
                                style={{ fontSize: 10, padding: "2px 7px" }}
                                onClick={() => retryLog(wh.id, log.id)}
                                disabled={retryingLogId === log.id}
                              >
                                {retryingLogId === log.id ? "…" : "Retry"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
