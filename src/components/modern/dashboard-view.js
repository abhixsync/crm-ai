"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const PIPELINE_CONFIG = [
  { status: "NEW", label: "New", color: "var(--ms-blue, #4f9cf9)" },
  { status: "CALL_PENDING", label: "Call pending", color: "var(--ms-pink, #f472b6)" },
  { status: "CALLING", label: "Calling", color: "var(--ms-green, #22c993)" },
  { status: "INTERESTED", label: "Interested", color: "var(--ms-green, #22c993)" },
  { status: "FOLLOW_UP", label: "Follow-up", color: "var(--ms-amber, #f5a623)" },
  { status: "CONVERTED", label: "Converted", color: "var(--ms-purple, #a78bfa)" },
  { status: "NOT_INTERESTED", label: "Not interested", color: "var(--ms-red, #f25858)" },
  { status: "DO_NOT_CALL", label: "Do not call", color: "var(--ms-muted, #6b7280)" },
];

const STATUS_BADGE_STYLE = {
  NEW: "rgba(79,156,249,.15)",
  CALL_PENDING: "rgba(242,88,88,.12)",
  CALLING: "rgba(34,201,147,.15)",
  INTERESTED: "rgba(34,201,147,.15)",
  FOLLOW_UP: "rgba(245,166,35,.15)",
  NOT_INTERESTED: "rgba(242,88,88,.12)",
  CONVERTED: "rgba(167,139,250,.15)",
  DO_NOT_CALL: "rgba(138,138,136,.14)",
  CALL_FAILED: "rgba(242,88,88,.12)",
  RETRY_SCHEDULED: "rgba(245,166,35,.15)",
};

const STATUS_BADGE_COLOR = {
  NEW: "var(--ms-blue, #93c5fd)",
  CALL_PENDING: "var(--ms-red, #fca5a5)",
  CALLING: "var(--ms-green, #6ee7b7)",
  INTERESTED: "var(--ms-green, #6ee7b7)",
  FOLLOW_UP: "var(--ms-amber, #fbbf24)",
  NOT_INTERESTED: "var(--ms-red, #fca5a5)",
  CONVERTED: "var(--ms-purple, #c4b5fd)",
  DO_NOT_CALL: "var(--ms-muted, #9ca3af)",
  CALL_FAILED: "var(--ms-red, #fca5a5)",
  RETRY_SCHEDULED: "var(--ms-amber, #fbbf24)",
};

const AVATAR_COLORS = [
  { bg: "rgba(34,201,147,.18)", fg: "#6ee7b7" },
  { bg: "rgba(245,166,35,.18)", fg: "#fbbf24" },
  { bg: "rgba(79,156,249,.18)", fg: "#93c5fd" },
  { bg: "rgba(167,139,250,.18)", fg: "#c4b5fd" },
  { bg: "rgba(242,88,88,.18)", fg: "#fca5a5" },
];

function getInitials(firstName, lastName) {
  return ((firstName?.[0] || "") + (lastName?.[0] || "")).toUpperCase() || "?";
}

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatAmount(amt) {
  if (!amt) return "—";
  if (amt >= 100000) return `₹${(amt / 100000).toFixed(0)}L`;
  if (amt >= 1000) return `₹${(amt / 1000).toFixed(0)}K`;
  return `₹${amt}`;
}

function timeAgo(date) {
  if (!date) return "Never";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }) {
  const bg = STATUS_BADGE_STYLE[status] || "rgba(138,138,136,.14)";
  const color = STATUS_BADGE_COLOR[status] || "#9ca3af";
  return (
    <span className="ms-bdg" style={{ background: bg, color }}>
      {(status || "").replace(/_/g, " ")}
    </span>
  );
}

export function ModernDashboardView({
  user,
  initialMetrics,
  initialCustomers,
  initialTenantName,
}) {
  const { data: session } = useSession();
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isAdmin = user.role === "ADMIN" || isSuperAdmin;

  const [metrics, setMetrics] = useState(initialMetrics);
  const [pipeline, setPipeline] = useState(null);
  const [customers, setCustomers] = useState(initialCustomers || []);
  const [followUps, setFollowUps] = useState([]);
  const [campaignHealth, setCampaignHealth] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [metricsRes, followUpRes] = await Promise.all([
        fetch("/api/dashboard/metrics?pipeline=1"),
        fetch("/api/customers?status=FOLLOW_UP&pageSize=3"),
      ]);

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data.metrics);
        if (data.pipeline) setPipeline(data.pipeline);
      }

      if (followUpRes.ok) {
        const data = await followUpRes.json();
        setFollowUps(data.customers || []);
      }
    } catch (err) {
      console.warn("[dashboard] Failed to fetch dashboard data:", err?.message);
    }
  }, []);

  const fetchCampaignHealth = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/calls/automation/health");
      if (res.ok) {
        const data = await res.json();
        setCampaignHealth(data);
      }
    } catch (err) {
      console.warn("[dashboard] Failed to fetch campaign health:", err?.message);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchDashboardData();
    fetchCampaignHealth();
  }, [fetchDashboardData, fetchCampaignHealth]);

  const totalForPipeline = pipeline
    ? Object.values(pipeline).reduce((a, b) => a + b, 0)
    : metrics.totalCustomers;

  const interestedPct = metrics.totalCustomers > 0
    ? Math.round((metrics.interestedCustomers / metrics.totalCustomers) * 100)
    : 0;

  // Campaign health data
  const campTotal = campaignHealth?.queue
    ? (campaignHealth.queue.waiting || 0) + (campaignHealth.queue.active || 0) +
      (campaignHealth.queue.completed || 0) + (campaignHealth.queue.failed || 0)
    : 0;
  const campCompleted = campaignHealth?.queue?.completed || 0;
  const campPct = campTotal > 0 ? Math.round((campCompleted / campTotal) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── 4 Metric Tiles ── */}
      <div className="ms-metrics">
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Total customers</div>
          <div className="ms-m-tile-val">{metrics.totalCustomers.toLocaleString()}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Total calls</div>
          <div className="ms-m-tile-val">{metrics.totalCalls.toLocaleString()}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Interested rate</div>
          <div className="ms-m-tile-val">{interestedPct}%</div>
          <div className="ms-m-tile-delta ms-delta-up">
            {metrics.interestedCustomers} interested
          </div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Follow-ups</div>
          <div className="ms-m-tile-val">{metrics.followUps.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Body: left + right columns ── */}
      <div className="ms-dash-body">
        {/* LEFT COLUMN */}
        <div className="ms-dash-left">
          {/* Pipeline */}
          <div className="ms-card">
            <div className="ms-card-hd">
              <span className="ms-card-title">Pipeline</span>
            </div>
            <div className="ms-pipeline-list">
              {PIPELINE_CONFIG.map(({ status, label, color }) => {
                const count = pipeline?.[status] ?? 0;
                const pct = totalForPipeline > 0 ? Math.round((count / totalForPipeline) * 100) : 0;
                return (
                  <div key={status} className="ms-pipe-row">
                    <div className="ms-pipe-row-label">{label}</div>
                    <div className="ms-pipe-track">
                      <div className="ms-pipe-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <div className="ms-pipe-row-count">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Customers */}
          <div className="ms-card">
            <div className="ms-cust-toolbar">
              <span className="ms-cust-toolbar-label">Recent customers</span>
            </div>
            <div className="ms-cust-cols">
              <span></span><span>Customer</span><span>Status</span><span>Last call</span>
            </div>
            <div className="ms-cust-list">
              {customers.slice(0, 5).map((c) => {
                const initials = getInitials(c.firstName, c.lastName);
                const avColor = getAvatarColor(c.firstName + c.lastName);
                const lastCall = c.calls?.[0]?.createdAt;
                return (
                  <div key={c.id} className="ms-cust-row">
                    <div className="ms-cust-av" style={{ background: avColor.bg, color: avColor.fg }}>{initials}</div>
                    <div>
                      <div className="ms-cust-name">{c.firstName} {c.lastName}</div>
                      <div className="ms-cust-sub">{c.phone}</div>
                    </div>
                    <div>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="ms-cust-time">{timeAgo(lastCall)}</div>
                  </div>
                );
              })}
              {customers.length === 0 && (
                <div className="ms-empty">No customers yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="ms-dash-right">
          {/* AI Agent Card */}
          <div className="ms-card">
            <div className="ms-ai-head">
              <div className="ms-ai-orb">
                <svg fill="none" stroke="var(--ms-accent)" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4" /><path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
                </svg>
              </div>
              <div>
                <div className="ms-ai-label">AI Agent</div>
                <div className="ms-ai-live">
                  {campaignHealth?.runtimeOnline && <span className="ms-pulse" />}
                  {campaignHealth?.runtimeOnline ? "Online" : "Offline"}
                </div>
              </div>
            </div>
            <div className="ms-ai-nums">
              <div className="ms-ai-n">
                <div className="ms-ai-n-lbl">Total calls</div>
                <div className="ms-ai-n-val">{metrics.totalCalls}</div>
              </div>
              <div className="ms-ai-n">
                <div className="ms-ai-n-lbl">Interested</div>
                <div className="ms-ai-n-val" style={{ color: "var(--ms-accent)" }}>{metrics.interestedCustomers}</div>
              </div>
              <div className="ms-ai-n">
                <div className="ms-ai-n-lbl">Follow-ups</div>
                <div className="ms-ai-n-val">{metrics.followUps}</div>
              </div>
              <div className="ms-ai-n">
                <div className="ms-ai-n-lbl">Queue</div>
                <div className="ms-ai-n-val" style={{ color: campaignHealth?.queue?.failed ? "var(--ms-red)" : undefined }}>
                  {campaignHealth?.queue?.waiting ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Campaign Card */}
          {campTotal > 0 && (
            <div className="ms-card">
              <div className="ms-card-hd">
                <span className="ms-card-title">Campaign</span>
                <span className="ms-bdg" style={{ background: "var(--ms-accent-dim)", color: "var(--ms-accent-txt)" }}>
                  {campaignHealth?.runtimeOnline ? "Active" : "Paused"}
                </span>
              </div>
              <div className="ms-prog-area">
                <div className="ms-prog-top">
                  <span>{campCompleted} of {campTotal} completed</span>
                  <span style={{ fontWeight: 600, color: "var(--ms-text)" }}>{campPct}%</span>
                </div>
                <div className="ms-prog-bar">
                  <div className="ms-prog-fill" style={{ width: `${campPct}%` }} />
                </div>
              </div>
              <div className="ms-camp-grid">
                <div className="ms-c-num"><div className="ms-c-num-v">{campTotal}</div><div className="ms-c-num-l">Total</div></div>
                <div className="ms-c-num"><div className="ms-c-num-v" style={{ color: "var(--ms-accent)" }}>{campCompleted}</div><div className="ms-c-num-l">Done</div></div>
                <div className="ms-c-num"><div className="ms-c-num-v" style={{ color: "var(--ms-amber)" }}>{campaignHealth?.queue?.waiting || 0}</div><div className="ms-c-num-l">Queued</div></div>
                <div className="ms-c-num"><div className="ms-c-num-v" style={{ color: "var(--ms-red)" }}>{campaignHealth?.queue?.failed || 0}</div><div className="ms-c-num-l">Failed</div></div>
              </div>
            </div>
          )}

          {/* Follow-ups Card */}
          <div className="ms-card">
            <div className="ms-card-hd">
              <span className="ms-card-title">Follow-ups</span>
              <span className="ms-bdg" style={{ background: "rgba(245,166,35,.15)", color: "var(--ms-amber)" }}>
                {metrics.followUps} due
              </span>
            </div>
            <div className="ms-fu-list">
              {followUps.length === 0 && (
                <div className="ms-empty" style={{ padding: "16px 0" }}>No follow-ups pending.</div>
              )}
              {followUps.map((c) => {
                const initials = getInitials(c.firstName, c.lastName);
                const avColor = getAvatarColor(c.firstName + c.lastName);
                return (
                  <div key={c.id} className="ms-fu-row">
                    <div className="ms-fu-av" style={{ background: avColor.bg, color: avColor.fg }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ms-fu-name">{c.firstName} {c.lastName}</div>
                      <div className="ms-fu-detail">{c.phone}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
