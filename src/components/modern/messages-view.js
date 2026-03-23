"use client";

import { useState, useMemo } from "react";

const CHANNEL_COLORS = {
  SMS: "#4f9cf9",
  WHATSAPP: "#22c993",
  EMAIL: "#a78bfa",
  PUSH: "#f5a623",
};

const STATUS_COLORS = {
  QUEUED: "#6b7280",
  SENT: "#4f9cf9",
  DELIVERED: "#22c993",
  READ: "#22c993",
  FAILED: "#f25858",
  BOUNCED: "#f25858",
};

function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

function formatCustomerName(c) {
  if (!c) return "Unknown";
  return `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unknown";
}

const CHANNEL_CHIPS = [
  { label: "All", value: "" },
  { label: "SMS", value: "SMS" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "Email", value: "EMAIL" },
];

export function ModernMessagesView({ user, initialMessages = [] }) {
  const [channelFilter, setChannelFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return initialMessages.filter((m) => {
      if (channelFilter && m.channel !== channelFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (m.content || "").toLowerCase().includes(q) ||
          formatCustomerName(m.customer).toLowerCase().includes(q) ||
          (m.toAddress || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialMessages, channelFilter, search]);

  const channelCounts = useMemo(() => {
    const counts = {};
    initialMessages.forEach((m) => { counts[m.channel] = (counts[m.channel] || 0) + 1; });
    return counts;
  }, [initialMessages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Channel summary */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(CHANNEL_COLORS).map(([channel, color]) => {
          const count = channelCounts[channel] || 0;
          return (
            <div
              key={channel}
              className="ms-card"
              style={{
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                borderLeft: channelFilter === channel ? `3px solid ${color}` : "3px solid transparent",
              }}
              onClick={() => setChannelFilter(channelFilter === channel ? "" : channel)}
            >
              <span style={{ fontSize: 22 }}>
                {channel === "SMS" ? "💬" : channel === "WHATSAPP" ? "📱" : channel === "EMAIL" ? "✉️" : "🔔"}
              </span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 11, color: "var(--ms-text3)" }}>{channel}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Messages table */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Message Log</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="ms-chips">
              {CHANNEL_CHIPS.map(({ label, value }) => (
                <button
                  key={value}
                  className={`ms-chip${channelFilter === value ? " active" : ""}`}
                  onClick={() => setChannelFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="ms-input"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 180, fontSize: 13 }}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="ms-empty">No messages match this filter.</div>
        ) : (
          <table className="ms-tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Channel</th>
                <th>Direction</th>
                <th>Status</th>
                <th>Content</th>
                <th>To</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const chColor = CHANNEL_COLORS[m.channel] || "#6b7280";
                const stColor = STATUS_COLORS[m.status] || "#6b7280";
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{formatCustomerName(m.customer)}</div>
                      <div style={{ fontSize: 11, color: "var(--ms-text3)" }}>{m.customer?.phone}</div>
                    </td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${chColor}18`, color: chColor }}>
                        {m.channel}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ms-text3)" }}>{m.direction}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${stColor}18`, color: stColor }}>
                        {m.status}
                      </span>
                    </td>
                    <td
                      style={{
                        maxWidth: 260,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 13,
                        color: "var(--ms-text2)",
                      }}
                    >
                      {m.subject ? <strong>{m.subject}: </strong> : null}
                      {m.content}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)", fontFamily: "monospace" }}>
                      {m.toAddress}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{formatTime(m.sentAt || m.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
