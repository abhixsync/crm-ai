"use client";

import { useMemo, useState } from "react";
import { CallsAiCallPanel } from "@/components/calls/calls-ai-call-panel";
import { CallsHistoryTable } from "@/components/calls/calls-history-table";

const STATUS_COLORS = {
  COMPLETED: "#22c993",
  NO_ANSWER: "#f25858",
  FAILED: "#f25858",
  ANSWERED: "#4f9cf9",
  IN_PROGRESS: "#f5a623",
};

const FILTER_CHIPS = [
  { label: "All", value: "" },
  { label: "Completed", value: "COMPLETED" },
  { label: "No answer", value: "NO_ANSWER" },
  { label: "Failed", value: "FAILED" },
];

function formatDuration(seconds) {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

function formatCustomerName(customer) {
  if (!customer) return "Unknown";
  return `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "Unknown";
}

export function ModernCallLogsView({ callLogs, customers, role }) {
  const [filter, setFilter] = useState("");

  const filteredLogs = useMemo(() => {
    if (!filter) return callLogs;
    return callLogs.filter((log) => log.status === filter);
  }, [callLogs, filter]);

  const summary = useMemo(() => {
    return callLogs.reduce((accumulator, log) => {
      const key = String(log.status || "UNKNOWN");
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
  }, [callLogs]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-metrics">
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Total calls</div>
          <div className="ms-m-tile-val">{callLogs.length}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Completed</div>
          <div className="ms-m-tile-val">{summary.COMPLETED || 0}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">No answer</div>
          <div className="ms-m-tile-val">{summary.NO_ANSWER || 0}</div>
        </div>
        <div className="ms-m-tile">
          <div className="ms-m-tile-lbl">Failed</div>
          <div className="ms-m-tile-val">{summary.FAILED || 0}</div>
        </div>
      </div>

      <div className="ms-module-frame ms-module-skin ms-calls-panel-module">
        <CallsAiCallPanel customers={customers} role={role} />
      </div>

      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Call activity</span>
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
        <div className="ms-tl">
          {filteredLogs.length === 0 && (
            <div className="ms-empty">No call logs match this filter.</div>
          )}
          {filteredLogs.slice(0, 12).map((log) => {
            const color = STATUS_COLORS[log.status] || "#6b7280";
            const name = formatCustomerName(log.customer);
            const phone = log.customer?.phone || "N/A";
            return (
              <div key={log.id} className="ms-ti">
                <div className="ms-ti-ic" style={{ background: `${color}18` }}>
                  <svg fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72" />
                  </svg>
                </div>
                <div className="ms-ti-b">
                  <div className="ms-ti-top">
                    <span className="ms-ti-name">{name}</span>
                    <span className="ms-bdg" style={{ background: `${color}18`, color }}>{log.status}</span>
                    {log.durationSeconds > 0 && (
                      <span style={{ fontSize: 11, color: "var(--ms-text3)" }}>
                        {formatDuration(log.durationSeconds)}
                      </span>
                    )}
                  </div>
                  <div className="ms-ti-meta">
                    {phone} | {log.direction || "OUTBOUND"} | Attempt {log.attemptNumber || 1}
                  </div>
                  {log.summary && <div className="ms-ti-sum">{log.summary}</div>}
                  <div className="ms-ti-time">{formatTime(log.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ms-card ms-module-skin ms-calls-history-module" style={{ padding: 20 }}>
        <div className="ms-card-hd" style={{ marginBottom: 12 }}>
          <span className="ms-card-title">Detailed call history</span>
        </div>
        <CallsHistoryTable callLogs={callLogs} />
      </div>
    </div>
  );
}
