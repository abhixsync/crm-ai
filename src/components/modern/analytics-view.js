"use client";

import { useMemo } from "react";

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
      <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1.1 }}>{(value ?? 0).toLocaleString()}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--ms-text3)" }}>{sub}</div>}
    </div>
  );
}

export function ModernAnalyticsView({ user, metrics, statusBreakdown = [], recentSnapshots = [] }) {
  const conversionRate = metrics.totalCustomers > 0
    ? ((metrics.conversions / metrics.totalCustomers) * 100).toFixed(1)
    : "0.0";

  const sortedSnapshots = useMemo(
    () => [...recentSnapshots].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14),
    [recentSnapshots]
  );

  const maxCustomers = Math.max(...sortedSnapshots.map((s) => s.totalCustomers || 0), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Metric cards */}
      <div className="ms-metrics">
        <MetricCard label="Total Customers" value={metrics.totalCustomers} sub="Active (not archived)" />
        <MetricCard label="Total Calls" value={metrics.totalCalls} sub="All time" color="var(--ms-blue, #4f9cf9)" />
        <MetricCard
          label="Conversions"
          value={metrics.conversions}
          sub={`${conversionRate}% rate`}
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
            const pct =
              metrics.totalCustomers > 0 ? ((item._count.id / metrics.totalCustomers) * 100).toFixed(1) : 0;
            const color = STATUS_COLORS[item.status] || "#6b7280";
            return (
              <div key={item.status} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: "clamp(60px, 25%, 110px)", fontSize: 12, color: "var(--ms-text2)", flexShrink: 0 }}>
                  {item.status.replace(/_/g, " ")}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    background: "var(--ms-border)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: color,
                      borderRadius: 4,
                      transition: "width .4s ease",
                    }}
                  />
                </div>
                <div style={{ width: 60, fontSize: 12, color: "var(--ms-text3)", textAlign: "right" }}>
                  {item._count.id.toLocaleString()} ({pct}%)
                </div>
              </div>
            );
          })}
          {statusBreakdown.length === 0 && <div className="ms-empty">No customer data yet.</div>}
        </div>
      </div>

      {/* Trend chart (simple bar) */}
      {sortedSnapshots.length > 0 && (
        <div className="ms-card">
          <div className="ms-card-hd">
            <span className="ms-card-title">Customer Growth (last 14 days)</span>
          </div>
          <div
            style={{
              padding: "12px 24px 20px",
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              height: 120,
            }}
          >
            {sortedSnapshots.map((s) => {
              const h = Math.max(4, ((s.totalCustomers || 0) / maxCustomers) * 90);
              return (
                <div
                  key={s.id}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                  title={`${formatDate(s.date)}: ${s.totalCustomers} customers`}
                >
                  <div
                    style={{
                      width: "100%",
                      height: h,
                      background: "var(--ms-accent)",
                      borderRadius: "3px 3px 0 0",
                      opacity: 0.75,
                    }}
                  />
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
