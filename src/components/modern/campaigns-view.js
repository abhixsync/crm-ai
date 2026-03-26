"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const STATUS_STYLE = {
  COMPLETED: { bg: "var(--ms-green-dim, rgba(34,201,147,.15))", color: "var(--ms-green, #6ee7b7)" },
  ACTIVE:    { bg: "var(--ms-green-dim, rgba(34,201,147,.10))", color: "var(--ms-green, #6ee7b7)" },
  QUEUED:    { bg: "var(--ms-amber-dim, rgba(245,166,35,.15))", color: "var(--ms-amber, #fbbf24)" },
  FAILED:    { bg: "var(--ms-red-dim, rgba(242,88,88,.12))",    color: "var(--ms-red, #fca5a5)" },
  SKIPPED:   { bg: "var(--ms-muted-dim, rgba(138,138,136,.14))", color: "var(--ms-muted, #9ca3af)" },
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(date) {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

const DEFAULT_SCHEDULE_CONFIG = {
  timezone: "Asia/Kolkata",
  callWindowStart: "09:00",
  callWindowEnd: "18:00",
  allowedDays: [1, 2, 3, 4, 5, 6],
  maxCallsPerDay: 200,
  maxRetries: 3,
  retryIntervalHours: 24,
  minCallGapMins: 30,
};

// ─── Campaign Settings Cards ─────────────────────────────
function CampaignSettings() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/call-schedule")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const cfg = data?.config || DEFAULT_SCHEDULE_CONFIG;
        setConfig(cfg);
        setForm(cfg);
      })
      .catch(() => {
        setConfig(DEFAULT_SCHEDULE_CONFIG);
        setForm(DEFAULT_SCHEDULE_CONFIG);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/call-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      setConfig(form);
      toast.success("Campaign settings saved");
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day) {
    setForm(f => ({
      ...f,
      allowedDays: f.allowedDays.includes(day)
        ? f.allowedDays.filter(d => d !== day)
        : [...f.allowedDays, day].sort(),
    }));
  }

  if (loading || !form) {
    return <div style={{ color: "var(--ms-text3)", fontSize: 13 }}>Loading settings…</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
      {/* Call Window */}
      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 14 }}>
          Call Window
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>Timezone</label>
            <select className="ms-input" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>Start time</label>
              <input className="ms-input" type="time" value={form.callWindowStart} onChange={e => setForm(f => ({ ...f, callWindowStart: e.target.value }))} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>End time</label>
              <input className="ms-input" type="time" value={form.callWindowEnd} onChange={e => setForm(f => ({ ...f, callWindowEnd: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>Allowed days</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`ms-btn ${form.allowedDays.includes(i) ? "ms-btn-pri" : ""}`}
                  style={{ fontSize: 11, padding: "3px 8px", minWidth: 36 }}
                  onClick={() => toggleDay(i)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Call Limits */}
      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 14 }}>
          Call Limits
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["maxCallsPerDay", "Max calls per day", 1, 5000],
            ["maxRetries", "Max retries per customer", 0, 10],
            ["retryIntervalHours", "Retry interval (hours)", 1, 168],
            ["minCallGapMins", "Min gap between calls (min)", 5, 480],
          ].map(([key, label, min, max]) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>{label}</label>
              <input
                className="ms-input"
                type="number"
                min={min}
                max={max}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Info + Save */}
      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 12 }}>
          About AI Campaigns
        </div>
        <div style={{ fontSize: 12, color: "var(--ms-text2)", lineHeight: 1.7, marginBottom: 16 }}>
          <p style={{ marginBottom: 8 }}>AI campaigns automatically call customers in the queue using the configured telephony provider. Calls are scheduled within the defined window, respecting retry limits and minimum gaps.</p>
          <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            <li>Upload leads via the Customers page → Excel Upload</li>
            <li>Enable "Enqueue for AI campaign" during upload</li>
            <li>Run the cron job or trigger manually via the Automation Health page</li>
            <li>Results appear in Campaign Jobs below</li>
          </ul>
        </div>
        <button className="ms-btn ms-btn-pri" onClick={saveConfig} disabled={saving} style={{ width: "100%" }}>
          {saving ? "Saving…" : "Save campaign settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────
export function ModernCampaignsView() {
  const [health, setHealth] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, jobsRes] = await Promise.all([
        fetch("/api/calls/automation/health"),
        fetch("/api/calls/automation/jobs?pageSize=50"),
      ]);
      if (healthRes.ok) { const data = await healthRes.json(); setHealth(data); }
      if (jobsRes.ok) { const data = await jobsRes.json(); setJobs(data.jobs || []); }
    } catch (err) {
      console.warn("[campaigns] Failed to fetch campaign data:", err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const queue = health?.queue || {};
  const total = (queue.waiting || 0) + (queue.active || 0) + (queue.completed || 0) + (queue.failed || 0);
  const completedPct = total > 0 ? Math.round(((queue.completed || 0) / total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Metric tiles */}
      <div className="ms-metrics">
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Total jobs</div>
          <div className="ms-m-tile-val">{total}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Completed</div>
          <div className="ms-m-tile-val">{queue.completed || 0}</div>
          {total > 0 && <div className="ms-m-tile-delta ms-delta-up">{completedPct}% success</div>}
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Queued</div>
          <div className="ms-m-tile-val">{queue.waiting || 0}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Failed</div>
          <div className="ms-m-tile-val">{queue.failed || 0}</div>
        </div>
      </div>

      {/* Settings toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className={`ms-btn ${showSettings ? "ms-btn-pri" : ""}`}
          onClick={() => setShowSettings(s => !s)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
          </svg>
          Campaign Settings
        </button>
        <span style={{ fontSize: 12, color: "var(--ms-text3)" }}>Configure call window, retry limits, and scheduling</span>
      </div>

      {/* Settings panel */}
      {showSettings && <CampaignSettings />}

      {/* Jobs table */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Campaign jobs</span>
          <button className="ms-btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={fetchData}>Refresh</button>
        </div>
        <div className="ms-tbl-wrap">
          <table className="ms-tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th style={{ textAlign: "center" }}>Attempts</th>
                <th>Enqueued</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ms-text3)" }}>Loading…</td></tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ms-text3)", padding: 32 }}>
                  No campaign jobs found. Upload leads and enqueue them to start.
                </td></tr>
              )}
              {jobs.map((job) => {
                const st = STATUS_STYLE[job.status] || STATUS_STYLE.SKIPPED;
                const custName = job.customer
                  ? `${job.customer.firstName || ""} ${job.customer.lastName || ""}`.trim() || "Unknown"
                  : "Unknown";
                return (
                  <tr key={job.id}>
                    <td style={{ fontWeight: 500 }}>{custName}</td>
                    <td><span className="ms-bdg" style={{ background: st.bg, color: st.color }}>{job.status}</span></td>
                    <td style={{ textAlign: "center", color: "var(--ms-text2)" }}>{job.attempts || 0}</td>
                    <td style={{ color: "var(--ms-text3)" }}>{formatTime(job.createdAt)}</td>
                    <td>{job.outcome || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
