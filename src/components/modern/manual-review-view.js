"use client";

import { useState, useMemo } from "react";

const STATUS_COLORS = {
  PENDING: "#f5a623",
  APPROVED: "#22c993",
  REJECTED: "#f25858",
  ESCALATED: "#4f9cf9",
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

const FILTER_CHIPS = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Escalated", value: "ESCALATED" },
];

export function ModernManualReviewView({ user, initialReviews = [] }) {
  const [filter, setFilter] = useState("PENDING");
  const [reviews, setReviews] = useState(initialReviews);

  const filtered = useMemo(() => {
    if (!filter) return reviews;
    return reviews.filter((r) => r.status === filter);
  }, [reviews, filter]);

  async function handleAction(id, action) {
    const res = await fetch(`/api/admin/manual-review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setReviews((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "ESCALATED" }
            : r
        )
      );
    }
  }

  const pendingCount = reviews.filter((r) => r.status === "PENDING").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-card">
        <div className="ms-card-hd">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ms-card-title">Manual Review Queue</span>
            {pendingCount > 0 && (
              <span
                className="ms-bdg"
                style={{ background: "rgba(245,166,35,.15)", color: "#f5a623" }}
              >
                {pendingCount} pending
              </span>
            )}
          </div>
          <div className="ms-chips">
            {FILTER_CHIPS.map(({ label, value }) => (
              <button
                key={value}
                className={`ms-chip${filter === value ? " active" : ""}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="ms-empty">No items match this filter.</div>
        ) : (
          <div className="ms-tbl-wrap"><table className="ms-tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Status</th>
                <th>AI Summary</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const color = STATUS_COLORS[r.status] || "#6b7280";
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{formatCustomerName(r.customer)}</div>
                      <div style={{ fontSize: 11, color: "var(--ms-text3)" }}>{r.customer?.phone}</div>
                    </td>
                    <td style={{ color: "var(--ms-text2)", fontSize: 13 }}>{r.reviewType || "—"}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${color}18`, color }}>
                        {r.status}
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
                      {r.aiSummary || r.callLog?.summary || "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{formatTime(r.createdAt)}</td>
                    <td>
                      {r.status === "PENDING" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="ms-btn ms-btn-xs"
                            style={{ background: "rgba(34,201,147,.15)", color: "#22c993" }}
                            onClick={() => handleAction(r.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            className="ms-btn ms-btn-xs"
                            style={{ background: "rgba(242,88,88,.12)", color: "#f25858" }}
                            onClick={() => handleAction(r.id, "reject")}
                          >
                            Reject
                          </button>
                          <button
                            className="ms-btn ms-btn-xs"
                            style={{ background: "rgba(79,156,249,.12)", color: "#4f9cf9" }}
                            onClick={() => handleAction(r.id, "escalate")}
                          >
                            Escalate
                          </button>
                        </div>
                      )}
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
