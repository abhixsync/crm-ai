"use client";

import { useState, useRef } from "react";

const STATUS_COLORS = {
  COMPLETED: "#22c993",
  PROCESSING: "#4f9cf9",
  FAILED: "#f25858",
  PENDING: "#f5a623",
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

export function ModernLeadUploadsView({ user }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  // Load history on mount
  useState(() => {
    fetch("/api/leads/uploads")
      .then((r) => r.json())
      .then((data) => setUploads(data.uploads || []))
      .catch(() => {});
  });

  async function uploadFile(file) {
    if (!file) return;
    setError("");
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/leads/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        setUploads((prev) => [data.upload, ...prev].filter(Boolean));
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Upload zone */}
      <div className="ms-card" style={{ padding: 24 }}>
        <span className="ms-card-title" style={{ marginBottom: 16, display: "block" }}>
          Upload Leads
        </span>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "var(--ms-accent)" : "var(--ms-border2)"}`,
            borderRadius: 10,
            padding: "32px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: dragging ? "var(--ms-accent-dim)" : "var(--ms-bg3)",
            transition: "all .2s",
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />
          <svg
            width={40}
            height={40}
            fill="none"
            stroke="var(--ms-accent)"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            style={{ margin: "0 auto 12px" }}
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          <div style={{ fontWeight: 500, color: "var(--ms-text1)" }}>
            {loading ? "Uploading…" : "Drop CSV / XLSX here or click to browse"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ms-text3)", marginTop: 6 }}>
            Columns: firstName, lastName, phone, email, status (optional)
          </div>
        </div>
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(242,88,88,.12)",
              color: "#f25858",
              borderRadius: 7,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Upload history */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Upload History</span>
        </div>
        {uploads.length === 0 ? (
          <div className="ms-empty">No uploads yet.</div>
        ) : (
          <table className="ms-tbl">
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Records</th>
                <th>Imported</th>
                <th>Failed</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => {
                const color = STATUS_COLORS[u.status] || "#6b7280";
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.fileName || u.originalName || "upload"}
                    </td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${color}18`, color }}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--ms-text2)" }}>{u.totalRecords ?? "—"}</td>
                    <td style={{ color: "#22c993" }}>{u.importedRecords ?? "—"}</td>
                    <td style={{ color: u.failedRecords > 0 ? "#f25858" : "var(--ms-text3)" }}>
                      {u.failedRecords ?? "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{formatTime(u.createdAt)}</td>
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
