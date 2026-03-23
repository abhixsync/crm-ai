"use client";

import { useState, useMemo } from "react";

const STAGES = [
  { value: "NEW", label: "New", color: "#4f9cf9" },
  { value: "QUALIFIED", label: "Qualified", color: "#a78bfa" },
  { value: "PROPOSAL", label: "Proposal", color: "#f5a623" },
  { value: "NEGOTIATION", label: "Negotiation", color: "#22c993" },
  { value: "WON", label: "Won", color: "#22c993" },
  { value: "LOST", label: "Lost", color: "#f25858" },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.value, s]));

function formatCurrency(val) {
  if (!val && val !== 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatCustomerName(c) {
  if (!c) return "Unknown";
  return `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unknown";
}

const FILTER_CHIPS = [
  { label: "All", value: "" },
  ...STAGES.map((s) => ({ label: s.label, value: s.value })),
];

export function ModernDealsView({ user, initialDeals = [] }) {
  const [filter, setFilter] = useState("");
  const [deals, setDeals] = useState(initialDeals);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", customerId: "", value: "", stage: "NEW", notes: "" });
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    if (!filter) return deals;
    return deals.filter((d) => d.stage === filter);
  }, [deals, filter]);

  const totalValue = useMemo(
    () => filtered.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0),
    [filtered]
  );

  async function saveNewDeal(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setDeals((prev) => [data.deal, ...prev]);
        setShowForm(false);
        setForm({ title: "", customerId: "", value: "", stage: "NEW", notes: "" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateStage(id, stage) {
    const res = await fetch(`/api/admin/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (res.ok) {
      setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, stage } : d)));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="ms-card" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Deal Pipeline</div>
          <div style={{ fontSize: 12, color: "var(--ms-text3)", marginTop: 2 }}>
            {filtered.length} deals · {formatCurrency(totalValue)} total
          </div>
        </div>
        <button className="ms-btn ms-btn-primary" onClick={() => setShowForm(true)}>
          + New Deal
        </button>
      </div>

      {/* New deal form */}
      {showForm && (
        <div className="ms-card" style={{ padding: 24, maxWidth: 520 }}>
          <span className="ms-card-title" style={{ marginBottom: 16, display: "block" }}>
            New Deal
          </span>
          <form onSubmit={saveNewDeal} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              className="ms-input"
              placeholder="Deal title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <input
              className="ms-input"
              placeholder="Customer ID"
              value={form.customerId}
              onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
              required
            />
            <input
              className="ms-input"
              type="number"
              placeholder="Deal value (USD)"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
            <select
              className="ms-input"
              value={form.stage}
              onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
            >
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <textarea
              className="ms-input"
              placeholder="Notes (optional)"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="ms-btn ms-btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Create deal"}
              </button>
              <button type="button" className="ms-btn" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deals table */}
      <div className="ms-card">
        <div className="ms-card-hd">
          <span className="ms-card-title">Deals</span>
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
          <div className="ms-empty">No deals match this filter.</div>
        ) : (
          <table className="ms-tbl">
            <thead>
              <tr>
                <th>Title</th>
                <th>Customer</th>
                <th>Value</th>
                <th>Stage</th>
                <th>Assigned to</th>
                <th>Expected close</th>
                <th>Move to</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const stageDef = STAGE_MAP[d.stage];
                const color = stageDef?.color || "#6b7280";
                const nextStages = STAGES.filter((s) => s.value !== d.stage).slice(0, 3);
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>{d.title}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{formatCustomerName(d.customer)}</div>
                      <div style={{ fontSize: 11, color: "var(--ms-text3)" }}>{d.customer?.phone}</div>
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--ms-accent)" }}>{formatCurrency(d.value)}</td>
                    <td>
                      <span className="ms-bdg" style={{ background: `${color}18`, color }}>
                        {stageDef?.label || d.stage}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ms-text2)" }}>{d.assignedTo?.name || "—"}</td>
                    <td style={{ fontSize: 13, color: "var(--ms-text3)" }}>{formatDate(d.expectedCloseDate)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {nextStages.map((s) => (
                          <button
                            key={s.value}
                            className="ms-btn ms-btn-xs"
                            style={{ background: `${s.color}15`, color: s.color }}
                            onClick={() => updateStage(d.id, s.value)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </td>
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
