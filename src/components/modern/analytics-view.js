"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

const STATUS_COLORS = {
  NEW: "var(--ms-blue, #4f9cf9)",
  CALL_PENDING: "var(--ms-red, #f25858)",
  CALLING: "var(--ms-green, #22c993)",
  INTERESTED: "var(--ms-green, #22c993)",
  FOLLOW_UP: "var(--ms-amber, #f5a623)",
  NOT_INTERESTED: "var(--ms-red, #f25858)",
  CONVERTED: "var(--ms-purple, #a78bfa)",
  DO_NOT_CALL: "var(--ms-muted, #6b7280)",
};

const CAMPAIGN_STATUS_STYLES = {
  COMPLETED: { background: "rgba(34,201,147,.15)", color: "#22c993" },
  RUNNING:   { background: "rgba(79,156,249,.15)", color: "#4f9cf9" },
  PAUSED:    { background: "rgba(245,166,35,.15)",  color: "#f5a623" },
  CANCELLED: { background: "rgba(107,114,128,.15)", color: "#9ca3af" },
};

function formatDate(date) {
  return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}

function MetricCard({ label, value, sub, color = "var(--ms-accent)" }) {
  return (
    <div
      className="ms-card"
      style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1.1 }}>
        {typeof value === "string" ? value : (value ?? 0).toLocaleString()}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--ms-text3)" }}>{sub}</div>}
    </div>
  );
}

function CampaignStatusBadge({ status }) {
  const style = CAMPAIGN_STATUS_STYLES[status] || CAMPAIGN_STATUS_STYLES.CANCELLED;
  return (
    <span style={{
      ...style,
      fontSize: 11,
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 4,
      textTransform: "uppercase",
      letterSpacing: ".04em",
    }}>
      {status}
    </span>
  );
}

function exportToCsv(campaignStats, range) {
  const rows = [
    ["Campaign", "Status", "Total Calls", "Completed", "Failed", "Interested", "Conversion %"],
    ...campaignStats.map((c) => [
      c.name,
      c.status,
      c.totalCalls,
      c.completed,
      c.failed,
      c.interested,
      c.conversionRate,
    ]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${range}d-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ModernAnalyticsView({ user }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (r) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/analytics/enhanced?range=${r}`);
      if (!res.ok) throw new Error("failed");
      setData(await res.json());
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const sortedSnapshots = useMemo(() => {
    if (!data?.dailySnapshots) return [];
    return [...data.dailySnapshots]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const maxCustomers = useMemo(
    () => Math.max(...sortedSnapshots.map((s) => s.totalCustomers || 0), 1),
    [sortedSnapshots]
  );

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ms-text3)" }}>Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="ms-card" style={{ padding: 20, color: "#f87171" }}>
        Failed to load analytics. Please refresh.
      </div>
    );
  }

  const { metrics, statusBreakdown = [], campaignStats = [], agentLeaderboard = [] } = data;
  const totalCustomers = metrics?.totalCustomers ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Page header row: title + controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ms-text)" }}>Analytics Overview</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Range picker */}
          <div style={{ display: "flex", gap: 4, background: "var(--ms-bg2)", borderRadius: 8, padding: 3 }}>
            {[7, 30, 90].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: range === r ? "1.5px solid var(--ms-accent)" : "1.5px solid transparent",
                  background: range === r ? "var(--ms-surface)" : "transparent",
                  color: range === r ? "var(--ms-accent)" : "var(--ms-text2)",
                  cursor: "pointer",
                  transition: "all .15s",
                }}
              >
                {r}d
              </button>
            ))}
          </div>
          {/* Export CSV */}
          <button
            className="ms-btn"
            onClick={() => exportToCsv(campaignStats, range)}
            style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ fontSize: 15 }}>&#8595;</span> Export CSV
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="ms-metrics">
        <MetricCard
          label="Total Customers"
          value={metrics?.totalCustomers}
          sub="All time"
        />
        <MetricCard
          label="New Customers"
          value={metrics?.newCustomers}
          sub={`Last ${range} days`}
          color="var(--ms-blue, #4f9cf9)"
        />
        <MetricCard
          label={`Calls (${range}d)`}
          value={metrics?.callsInRange}
          sub={`${metrics?.totalCalls ?? 0} total all time`}
          color="var(--ms-blue, #4f9cf9)"
        />
        <MetricCard
          label="Call Success Rate"
          value={`${metrics?.callSuccessRate ?? "0.0"}%`}
          sub={`Last ${range} days`}
          color="var(--ms-accent)"
        />
        <MetricCard
          label="Conversions"
          value={metrics?.conversions}
          sub="All time"
          color="var(--ms-purple, #a78bfa)"
        />
      </div>

      {/* Status breakdown */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Customer Status Breakdown</span>
        </div>
        <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {statusBreakdown.map((item) => {
            const count = typeof item._count === "object" ? (item._count.id ?? 0) : (item._count ?? 0);
            const pct = totalCustomers > 0 ? ((count / totalCustomers) * 100).toFixed(1) : 0;
            const color = STATUS_COLORS[item.status] || "#6b7280";
            return (
              <div key={item.status} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: "clamp(60px,25%,110px)", fontSize: 12, color: "var(--ms-text2)", flexShrink: 0 }}>
                  {item.status.replace(/_/g, " ")}
                </div>
                <div style={{ flex: 1, height: 8, background: "var(--ms-border)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width .4s ease" }} />
                </div>
                <div style={{ width: 80, fontSize: 12, color: "var(--ms-text3)", textAlign: "right" }}>
                  {count.toLocaleString()} ({pct}%)
                </div>
              </div>
            );
          })}
          {statusBreakdown.length === 0 && <div className="ms-empty">No customer data yet.</div>}
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Campaign Performance</span>
        </div>
        <div style={{ padding: "0 0 4px" }}>
          {campaignStats.length === 0 ? (
            <div className="ms-empty" style={{ padding: "20px 24px" }}>No campaigns in this period.</div>
          ) : (
            <table className="ms-tbl" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Total Calls</th>
                  <th style={{ textAlign: "right" }}>Completed</th>
                  <th style={{ textAlign: "right" }}>Failed</th>
                  <th style={{ textAlign: "right" }}>Interested</th>
                  <th style={{ textAlign: "right" }}>Conversion %</th>
                </tr>
              </thead>
              <tbody>
                {campaignStats.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td><CampaignStatusBadge status={c.status} /></td>
                    <td style={{ textAlign: "right" }}>{c.totalCalls.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{c.completed.toLocaleString()}</td>
                    <td style={{ textAlign: "right", color: "#f87171" }}>{c.failed.toLocaleString()}</td>
                    <td style={{ textAlign: "right", color: "var(--ms-green, #22c993)" }}>{c.interested.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{
                        background: "rgba(29,233,168,.1)",
                        color: "var(--ms-accent)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}>
                        {c.conversionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Agent Leaderboard */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Agent Leaderboard</span>
        </div>
        <div style={{ padding: "0 0 4px" }}>
          {agentLeaderboard.length === 0 ? (
            <div className="ms-empty" style={{ padding: "20px 24px" }}>No call data in this period.</div>
          ) : (
            <table className="ms-tbl" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rank</th>
                  <th>Agent</th>
                  <th style={{ textAlign: "right" }}>Calls</th>
                  <th style={{ textAlign: "right" }}>Interested</th>
                </tr>
              </thead>
              <tbody>
                {agentLeaderboard.map((agent, i) => (
                  <tr key={agent.userId}>
                    <td>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: i === 0 ? "#f5a623" : i === 1 ? "#9ca3af" : i === 2 ? "#cd7c3e" : "var(--ms-text3)",
                      }}>
                        #{i + 1}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{agent.name}</td>
                    <td style={{ textAlign: "right" }}>{agent.totalCalls.toLocaleString()}</td>
                    <td style={{ textAlign: "right", color: "var(--ms-green, #22c993)" }}>
                      {agent.interested.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Customer Growth chart */}
      {sortedSnapshots.length > 0 && (
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">Customer Growth (last {range} days)</span>
          </div>
          <div style={{ padding: "12px 24px 20px", display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
            {sortedSnapshots.map((s, idx) => {
              const h = Math.max(4, ((s.totalCustomers || 0) / maxCustomers) * 90);
              return (
                <div
                  key={s.id ?? idx}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                  title={`${formatDate(s.date)}: ${s.totalCustomers} customers`}
                >
                  <div style={{ width: "100%", height: h, background: "var(--ms-accent)", borderRadius: "3px 3px 0 0", opacity: 0.75 }} />
                  <div style={{ fontSize: 9, color: "var(--ms-text3)" }}>{formatDate(s.date)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
