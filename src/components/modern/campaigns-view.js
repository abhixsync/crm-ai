"use client";

import { useCallback, useEffect, useState } from "react";

const STATUS_STYLE = {
  COMPLETED: { bg: "rgba(34,201,147,.15)", color: "#6ee7b7" },
  ACTIVE: { bg: "rgba(34,201,147,.10)", color: "#6ee7b7" },
  QUEUED: { bg: "rgba(245,166,35,.15)", color: "#fbbf24" },
  FAILED: { bg: "rgba(242,88,88,.12)", color: "#fca5a5" },
  SKIPPED: { bg: "rgba(138,138,136,.14)", color: "#9ca3af" },
};

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

export function ModernCampaignsView() {
  const [health, setHealth] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, jobsRes] = await Promise.all([
        fetch("/api/calls/automation/health"),
        fetch("/api/calls/automation/jobs?pageSize=50"),
      ]);

      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealth(data);
      }

      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const queue = health?.queue || {};
  const total = (queue.waiting || 0) + (queue.active || 0) + (queue.completed || 0) + (queue.failed || 0);
  const completedPct = total > 0 ? Math.round(((queue.completed || 0) / total) * 100) : 0;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Metric tiles */}
      <div className="ms-metrics">
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Total jobs</div>
          <div className="ms-m-tile-val">{total}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Completed</div>
          <div className="ms-m-tile-val">{queue.completed || 0}</div>
          {total > 0 && (
            <div className="ms-m-tile-delta ms-delta-up">{completedPct}% success</div>
          )}
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

      {/* Jobs table */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Campaign jobs</span>
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
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--ms-text3)" }}>Loading…</td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--ms-text3)" }}>No campaign jobs found.</td>
                </tr>
              )}
              {jobs.map((job) => {
                const st = STATUS_STYLE[job.status] || STATUS_STYLE.SKIPPED;
                const custName = job.customer
                  ? `${job.customer.firstName || ""} ${job.customer.lastName || ""}`.trim() || "Unknown"
                  : "Unknown";
                return (
                  <tr key={job.id}>
                    <td style={{ fontWeight: 500 }}>{custName}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: st.bg, color: st.color }}>{job.status}</span>
                    </td>
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
