"use client";

import { useState, useEffect } from "react";

const HEALTH_COLORS = {
  healthy: "#22c993",
  degraded: "#f5a623",
  down: "#f25858",
  unknown: "#6b7280",
};

function StatusDot({ status }) {
  const color = HEALTH_COLORS[status] || HEALTH_COLORS.unknown;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}88`,
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

function ServiceCard({ name, status, latency, lastChecked, details }) {
  const color = HEALTH_COLORS[status] || HEALTH_COLORS.unknown;
  return (
    <div
      className="ms-card"
      style={{
        padding: "16px 20px",
        borderLeft: `3px solid ${color}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", fontWeight: 600, fontSize: 14 }}>
          <StatusDot status={status} />
          {name}
        </div>
        <span className="ms-bdg" style={{ background: `${color}18`, color }}>
          {status}
        </span>
      </div>
      {latency != null && (
        <div style={{ fontSize: 12, color: "var(--ms-text3)" }}>Latency: {latency}ms</div>
      )}
      {details && <div style={{ fontSize: 12, color: "var(--ms-text2)" }}>{details}</div>}
      {lastChecked && (
        <div style={{ fontSize: 11, color: "var(--ms-text3)" }}>
          Last checked: {new Date(lastChecked).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

const INITIAL_SERVICES = [
  { name: "AI Call Engine", key: "ai_engine", status: "unknown" },
  { name: "Telephony (Twilio/VAPI)", key: "telephony", status: "unknown" },
  { name: "Job Queue (BullMQ)", key: "queue", status: "unknown" },
  { name: "Database (Prisma/Neon)", key: "database", status: "unknown" },
  { name: "Email Service (SMTP)", key: "email", status: "unknown" },
  { name: "Webhook Dispatcher", key: "webhooks", status: "unknown" },
];

export function ModernAutomationHealthView({ user }) {
  const [services, setServices] = useState(INITIAL_SERVICES);
  const [checking, setChecking] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  async function checkHealth() {
    setChecking(true);
    try {
      const res = await fetch("/api/admin/health");
      if (res.ok) {
        const data = await res.json();
        setServices((prev) =>
          prev.map((svc) => ({
            ...svc,
            ...(data[svc.key] || {}),
          }))
        );
        setLastRefresh(new Date());
      }
    } catch {
      // silently fail — services remain "unknown"
    } finally {
      setChecking(false);
      setInitialLoad(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  const healthCounts = services.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    },
    {}
  );

  const overallStatus =
    (healthCounts.down || 0) > 0
      ? "down"
      : (healthCounts.degraded || 0) > 0
      ? "degraded"
      : (healthCounts.unknown || 0) === services.length
      ? "unknown"
      : "healthy";

  const overallColor = HEALTH_COLORS[overallStatus];

  if (initialLoad) {
    return <div className="ms-empty">Checking system health...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Overall status banner */}
      <div
        className="ms-card"
        style={{
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderLeft: `4px solid ${overallColor}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StatusDot status={overallStatus} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              System {overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
            </div>
            {lastRefresh && (
              <div style={{ fontSize: 12, color: "var(--ms-text3)" }}>
                Last refreshed at {lastRefresh.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
        <button
          className="ms-btn"
          onClick={checkHealth}
          disabled={checking}
          style={{ minWidth: 110 }}
        >
          {checking ? "Checking…" : "Refresh"}
        </button>
      </div>

      {/* Service grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {services.map(({ key, ...rest }) => (
          <ServiceCard key={key} {...rest} />
        ))}
      </div>

      {/* Summary counts */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(HEALTH_COLORS).map(([status, color]) => {
          const count = healthCounts[status] || 0;
          if (count === 0) return null;
          return (
            <div
              key={status}
              className="ms-card"
              style={{
                padding: "10px 18px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
              }}
            >
              <StatusDot status={status} />
              <span style={{ color: "var(--ms-text2)" }}>
                {count} {status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
