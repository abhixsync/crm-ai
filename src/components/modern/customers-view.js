"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

/* ── Status config ── */
const STATUS_OPTIONS = [
  "NEW", "CALL_PENDING", "CALLING", "INTERESTED", "FOLLOW_UP",
  "NOT_INTERESTED", "DO_NOT_CALL", "CONVERTED", "CALL_FAILED", "RETRY_SCHEDULED",
];
const TERMINAL_STATUSES = new Set(["CONVERTED", "DO_NOT_CALL"]);

const STATUS_BG = {
  NEW: "rgba(79,156,249,.15)", CALL_PENDING: "rgba(242,88,88,.12)",
  CALLING: "rgba(34,201,147,.15)", INTERESTED: "rgba(34,201,147,.15)",
  FOLLOW_UP: "rgba(245,166,35,.15)", NOT_INTERESTED: "rgba(242,88,88,.12)",
  CONVERTED: "rgba(167,139,250,.15)", DO_NOT_CALL: "rgba(138,138,136,.14)",
  CALL_FAILED: "rgba(242,88,88,.12)", RETRY_SCHEDULED: "rgba(245,166,35,.15)",
};
const STATUS_FG = {
  NEW: "#93c5fd", CALL_PENDING: "#fca5a5",
  CALLING: "#6ee7b7", INTERESTED: "#6ee7b7",
  FOLLOW_UP: "#fbbf24", NOT_INTERESTED: "#fca5a5",
  CONVERTED: "#c4b5fd", DO_NOT_CALL: "#9ca3af",
  CALL_FAILED: "#fca5a5", RETRY_SCHEDULED: "#fbbf24",
};

const AVATAR_COLORS = [
  { bg: "rgba(34,201,147,.18)", fg: "#6ee7b7" },
  { bg: "rgba(245,166,35,.18)", fg: "#fbbf24" },
  { bg: "rgba(79,156,249,.18)", fg: "#93c5fd" },
  { bg: "rgba(167,139,250,.18)", fg: "#c4b5fd" },
  { bg: "rgba(242,88,88,.18)", fg: "#fca5a5" },
];

const EMPTY_FORM = {
  firstName: "", lastName: "", phone: "", email: "",
  city: "", state: "", source: "Manual Entry", loanType: "",
  loanAmount: "", monthlyIncome: "", status: "NEW", notes: "",
};

/* ── Helpers ── */
function initials(f, l) { return ((f?.[0] || "") + (l?.[0] || "")).toUpperCase() || "?"; }
function avColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function timeAgo(d) {
  if (!d) return "Never";
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "Now";
  if (m < 60) return `${m}m ago`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
function statusLabel(s) {
  return (s || "").replace(/_/g, " ");
}
function formatLoan(type, amt) {
  if (!type && !amt) return "";
  const a = amt ? (amt >= 100000 ? `₹${(amt / 100000).toFixed(0)}L` : amt >= 1000 ? `₹${(amt / 1000).toFixed(0)}K` : `₹${amt}`) : "";
  return [type, a].filter(Boolean).join(" • ");
}

/* ── Badge ── */
function StatusBadge({ status }) {
  return (
    <span className="ms-bdg" style={{ background: STATUS_BG[status] || "rgba(138,138,136,.14)", color: STATUS_FG[status] || "#9ca3af" }}>
      {statusLabel(status)}
    </span>
  );
}

/* ── Main component ── */
export function ModernCustomersView({
  user,
  canDeleteAllCustomers = false,
  initialTenantName,
  initialMetrics,
  initialCustomers,
  initialPagination,
}) {
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isAdmin = user.role === "ADMIN" || isSuperAdmin;

  /* ── State ── */
  const [metrics, setMetrics] = useState(initialMetrics);
  const [customers, setCustomers] = useState(initialCustomers || []);
  const [pagination, setPagination] = useState(initialPagination);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState({});
  const [selected, setSelected] = useState([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [busyCallId, setBusyCallId] = useState("");

  /* Confirmation dialog */
  const [confirm, setConfirm] = useState(null);

  /* Add/Edit modal */
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [creationMode, setCreationMode] = useState("manual");
  const [uploading, setUploading] = useState(false);
  const [enqueueAfterUpload, setEnqueueAfterUpload] = useState(false);

  const pageRef = useRef(initialPagination?.page || 1);
  const filtersInitRef = useRef(false);

  /* ── API calls ── */
  const fetchMetrics = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/metrics");
      if (r.ok) { const d = await r.json(); setMetrics(d.metrics); }
    } catch {}
  }, []);

  const fetchCustomers = useCallback(async (page = pageRef.current, opts = { showLoading: true }) => {
    if (opts.showLoading) setLoading(true);
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (statusFilter) p.set("status", statusFilter);
    p.set("page", String(page || 1));
    p.set("pageSize", String(pagination.pageSize));
    try {
      const r = await fetch(`/api/customers?${p}`);
      const d = await r.json();
      setCustomers(d.customers || []);
      setPagination(d.pagination || initialPagination);
      pageRef.current = d.pagination?.page || page;
    } finally {
      if (opts.showLoading) setLoading(false);
    }
  }, [initialPagination, pagination.pageSize, query, statusFilter]);

  /* Debounced filter effect */
  useEffect(() => {
    if (!filtersInitRef.current) { filtersInitRef.current = true; return; }
    const t = setTimeout(() => fetchCustomers(1), 250);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  /* ── Status update ── */
  async function updateStatus(id, status) {
    const prev = customers.find(c => c.id === id);
    if (!prev || prev.status === status) return;
    if (TERMINAL_STATUSES.has(prev.status)) { toast.error(`${statusLabel(prev.status)} cannot be changed.`); return; }
    setCustomers(cs => cs.map(c => c.id === id ? { ...c, status } : c));
    setStatusUpdating(p => ({ ...p, [id]: true }));
    try {
      const r = await fetch(`/api/customers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Update failed"); }
      await Promise.all([fetchMetrics(), fetchCustomers(pageRef.current, { showLoading: false })]);
    } catch (e) {
      setCustomers(cs => cs.map(c => c.id === id ? { ...c, status: prev.status } : c));
      toast.error(e.message || "Update failed");
    } finally {
      setStatusUpdating(p => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  /* ── Delete ── */
  async function deleteCustomer(c) {
    setDeletingId(c.id);
    try {
      const r = await fetch(`/api/customers/${c.id}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "Delete failed"); return; }
      toast.success("Customer deleted.");
      if (editId === c.id) { setEditId(""); setForm(EMPTY_FORM); }
      await Promise.all([fetchMetrics(), fetchCustomers(pagination.page)]);
    } finally { setDeletingId(""); }
  }

  function confirmDelete(c) {
    const name = `${c.firstName} ${c.lastName || ""}`.trim();
    setConfirm({
      title: "Delete customer?",
      message: `${name || "Selected customer"} will be removed.`,
      label: "Delete",
      onConfirm: () => { setConfirm(null); deleteCustomer(c); },
    });
  }

  async function deleteAllCustomers() {
    setDeletingAll(true);
    try {
      const r = await fetch("/api/customers/delete-all", { method: "DELETE" });
      if (!r.ok) { toast.error("Delete all failed"); return; }
      toast.success("All customers deleted.");
      await Promise.all([fetchMetrics(), fetchCustomers(1)]);
    } catch { toast.error("Delete all failed"); } finally { setDeletingAll(false); }
  }

  function confirmDeleteAll() {
    setConfirm({
      title: "Delete all customers?",
      message: "This will permanently remove all customers, call logs, and campaign data.",
      label: "Delete All",
      onConfirm: () => { setConfirm(null); deleteAllCustomers(); },
    });
  }

  /* ── Batch delete ── */
  async function batchDelete() {
    if (!selected.length) return;
    setBatchRunning(true);
    try {
      const r = await fetch("/api/customers/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DELETE", customerIds: selected }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Batch delete failed");
      toast.success(`${d.count} customer${d.count === 1 ? "" : "s"} deleted.`);
      setSelected([]);
      await Promise.all([fetchMetrics(), fetchCustomers(pagination.page)]);
    } catch (e) { toast.error(e.message); } finally { setBatchRunning(false); }
  }

  function confirmBatchDelete() {
    setConfirm({
      title: `Delete ${selected.length} selected?`,
      message: "Selected customers will be permanently removed.",
      label: "Delete",
      onConfirm: () => { setConfirm(null); batchDelete(); },
    });
  }

  /* ── Trigger AI call ── */
  async function triggerCall(c) {
    setBusyCallId(c.id);
    try {
      const r = await fetch("/api/calls/trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: c.id }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Call failed"); return; }
      toast.success(d.info || `Call initiated via ${d.provider || "provider"}.`);
      await Promise.all([fetchMetrics(), fetchCustomers()]);
    } catch { toast.error("Call failed"); } finally { setBusyCallId(""); }
  }

  /* ── Add / Edit ── */
  function startCreate() { setEditId(""); setForm(EMPTY_FORM); setCreationMode("manual"); setEnqueueAfterUpload(false); setShowModal(true); }
  function startEdit(c) {
    setEditId(c.id);
    setCreationMode("manual");
    setForm({
      firstName: c.firstName || "", lastName: c.lastName || "", phone: c.phone || "",
      email: c.email || "", city: c.city || "", state: c.state || "",
      source: c.source || "Manual Entry", loanType: c.loanType || "",
      loanAmount: c.loanAmount || "", monthlyIncome: c.monthlyIncome || "",
      status: c.status || "NEW", notes: c.notes || "",
    });
    setShowModal(true);
  }

  async function saveCustomer() {
    if (!form.firstName || !form.phone) { toast.error("First name and phone required."); return; }
    setSaving(true);
    const payload = { ...form, loanAmount: form.loanAmount ? Number(form.loanAmount) : null, monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : null };
    try {
      const r = await fetch(editId ? `/api/customers/${editId}` : "/api/customers", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "Save failed"); return; }
      toast.success(editId ? "Customer updated." : "Customer created.");
      setShowModal(false); setEditId(""); setForm(EMPTY_FORM);
      await Promise.all([fetchMetrics(), fetchCustomers(1)]);
    } catch { toast.error("Save failed"); } finally { setSaving(false); }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("enqueue", enqueueAfterUpload ? "true" : "false");
    try {
      const r = await fetch("/api/leads/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Upload failed");
      toast.success(`Upload complete: ${d.successRows || 0}/${d.totalRows || 0} rows.`);
      e.target.value = "";
      setShowModal(false); setEnqueueAfterUpload(false);
      await Promise.all([fetchMetrics(), fetchCustomers(1)]);
    } catch (err) { toast.error(err.message || "Upload failed"); } finally { setUploading(false); }
  }

  /* ── Selection ── */
  function toggleSelect(id) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function toggleAll() { setSelected(s => s.length === customers.length ? [] : customers.map(c => c.id)); }

  /* ── Pagination ── */
  function goPage(p) { fetchCustomers(p); }

  /* ── Render ── */
  return (
    <>
      {/* Metric tiles */}
      <div className="ms-metrics">
        <div className="ms-m-tile"><div className="ms-m-tile-lbl">Total customers</div><div className="ms-m-tile-val">{(metrics?.totalCustomers ?? 0).toLocaleString()}</div></div>
        <div className="ms-m-tile"><div className="ms-m-tile-lbl">Interested</div><div className="ms-m-tile-val" style={{ color: "var(--ms-accent)" }}>{(metrics?.interestedCustomers ?? 0).toLocaleString()}</div></div>
        <div className="ms-m-tile"><div className="ms-m-tile-lbl">Follow-ups</div><div className="ms-m-tile-val">{(metrics?.followUps ?? 0).toLocaleString()}</div></div>
        <div className="ms-m-tile"><div className="ms-m-tile-lbl">Total calls</div><div className="ms-m-tile-val">{(metrics?.totalCalls ?? 0).toLocaleString()}</div></div>
      </div>

      {/* Customer table card */}
      <div className="ms-card">
        {/* Toolbar */}
        <div className="ms-cust-toolbar">
          <span className="ms-cust-toolbar-label">Customers</span>
          <input
            className="ms-srch"
            placeholder="Search name, phone, email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <select
            className="ms-srch"
            style={{ width: 140 }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <button className="ms-btn ms-btn-pri" onClick={startCreate}>+ Add</button>
          {canDeleteAllCustomers && (
            <button className="ms-btn" style={{ color: "var(--ms-red)" }} onClick={confirmDeleteAll} disabled={deletingAll}>
              {deletingAll ? "Deleting…" : "Delete All"}
            </button>
          )}
        </div>

        {/* Batch bar */}
        {selected.length > 0 && (
          <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--ms-border)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--ms-text2)" }}>{selected.length} selected</span>
            <button className="ms-btn" style={{ color: "var(--ms-red)", fontSize: 11 }} onClick={confirmBatchDelete} disabled={batchRunning}>
              {batchRunning ? "Deleting…" : "Delete Selected"}
            </button>
          </div>
        )}

        {/* Table */}
        <div className="ms-tbl-wrap">
          <table className="ms-tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={customers.length > 0 && selected.length === customers.length} onChange={toggleAll} />
                </th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Loan</th>
                <th>Status</th>
                <th>Last Call</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && customers.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--ms-text3)" }}>Loading…</td></tr>
              )}
              {!loading && customers.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--ms-text3)" }}>No customers found.</td></tr>
              )}
              {customers.map(c => {
                const name = `${c.firstName} ${c.lastName || ""}`.trim();
                const av = avColor(name);
                const lastCall = c.calls?.[0]?.createdAt;
                const isTerminal = TERMINAL_STATUSES.has(c.status);
                return (
                  <tr key={c.id}>
                    <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="ms-cust-av" style={{ background: av.bg, color: av.fg }}>{initials(c.firstName, c.lastName)}</div>
                        <div>
                          <div className="ms-cust-name">{name}</div>
                          {c.email && <div className="ms-cust-sub">{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span className="ms-mono">{c.phone}</span></td>
                    <td style={{ fontSize: 12, color: "var(--ms-text2)" }}>{formatLoan(c.loanType, c.loanAmount) || "—"}</td>
                    <td>
                      <select
                        style={{
                          fontSize: 11, fontWeight: 500, padding: "4px 8px", borderRadius: 6,
                          border: "1px solid var(--ms-border2)", background: STATUS_BG[c.status] || "transparent",
                          color: STATUS_FG[c.status] || "var(--ms-text)", cursor: isTerminal ? "not-allowed" : "pointer",
                          opacity: isTerminal ? 0.6 : 1, fontFamily: "inherit", outline: "none",
                        }}
                        value={c.status}
                        disabled={Boolean(statusUpdating[c.id]) || isTerminal}
                        onChange={e => updateStatus(c.id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                      </select>
                    </td>
                    <td><span className="ms-cust-time">{timeAgo(lastCall)}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="ms-btn" style={{ fontSize: 11 }} onClick={() => triggerCall(c)} disabled={busyCallId === c.id}>
                          {busyCallId === c.id ? "…" : "Call"}
                        </button>
                        <button className="ms-btn" style={{ fontSize: 11 }} onClick={() => startEdit(c)}>Edit</button>
                        <button className="ms-btn" style={{ fontSize: 11, color: "var(--ms-red)" }} onClick={() => confirmDelete(c)} disabled={deletingId === c.id}>
                          {deletingId === c.id ? "…" : "Del"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* Pagination */}
      <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--ms-surface)", border: "1px solid var(--ms-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--ms-text3)" }}>
          Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="ms-btn" disabled={pagination.page <= 1} onClick={() => goPage(pagination.page - 1)}>← Prev</button>
          <button className="ms-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => goPage(pagination.page + 1)}>Next →</button>
        </div>
      </div>

      {/* ── Confirmation Dialog (centered) ── */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)" }}
          onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div style={{ width: 360, padding: 20, borderRadius: 12, background: "var(--ms-surface)", border: "1px solid var(--ms-border)", boxShadow: "0 8px 30px rgba(0,0,0,.35)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ms-text)", marginBottom: 8 }}>{confirm.title}</div>
            <div style={{ fontSize: 12, color: "var(--ms-text2)", marginBottom: 18, lineHeight: 1.5 }}>{confirm.message}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ms-btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="ms-btn" style={{ background: "var(--ms-red)", color: "#fff" }} onClick={confirm.onConfirm}>{confirm.label}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setEditId(""); setForm(EMPTY_FORM); } }}>
          <div style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", borderRadius: 12, background: "var(--ms-surface)", border: "1px solid var(--ms-border)", padding: 24 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ms-text)" }}>
                {editId ? "Edit Customer" : "Add Customer"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {!editId && (
                  <>
                    <button className={`ms-btn ${creationMode === "manual" ? "ms-btn-pri" : ""}`} onClick={() => setCreationMode("manual")}>Manual</button>
                    <button className={`ms-btn ${creationMode === "upload" ? "ms-btn-pri" : ""}`} onClick={() => setCreationMode("upload")}>Excel Upload</button>
                  </>
                )}
                <button className="ms-btn" onClick={() => { setShowModal(false); setEditId(""); setForm(EMPTY_FORM); }}>✕</button>
              </div>
            </div>

            {creationMode === "upload" && !editId ? (
              <div>
                <p style={{ fontSize: 12, color: "var(--ms-text2)", marginBottom: 12 }}>
                  Download sample Excel, fill in data, and upload. Accepted: .xlsx, .xls, .csv
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <Link href="/samples/sample.xlsx" target="_blank" rel="noopener noreferrer">
                    <button className="ms-btn">Download sample.xlsx</button>
                  </Link>
                </div>
                {isAdmin && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ms-text2)", marginBottom: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={enqueueAfterUpload} onChange={e => setEnqueueAfterUpload(e.target.checked)} disabled={uploading} />
                    Enqueue uploaded customers for AI campaign after upload
                  </label>
                )}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: "1px dashed var(--ms-border2)", fontSize: 12, color: "var(--ms-text)", fontWeight: 500 }}>
                  {uploading ? "Uploading…" : "Select Excel File"}
                  <input type="file" style={{ display: "none" }} accept=".xlsx,.xls,.csv" onChange={onUpload} disabled={uploading} />
                </label>
              </div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    ["firstName", "First Name"], ["lastName", "Last Name"], ["phone", "Phone"],
                    ["email", "Email"], ["city", "City"], ["state", "State"],
                    ["loanType", "Loan Type"], ["loanAmount", "Loan Amount"], ["monthlyIncome", "Monthly Income"],
                    ["source", "Source"], ["notes", "Notes"],
                  ].map(([key, label]) => (
                    <input key={key} className="ms-srch" style={{ width: "100%" }} placeholder={label}
                      value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  ))}
                  <select className="ms-srch" style={{ width: "100%" }} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="ms-btn ms-btn-pri" onClick={saveCustomer} disabled={saving}>
                    {saving ? "Saving…" : editId ? "Update" : "Create"}
                  </button>
                  <button className="ms-btn" onClick={() => setForm(EMPTY_FORM)}>Clear</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
