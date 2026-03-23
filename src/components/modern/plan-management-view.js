"use client";

import { useCallback, useEffect, useState } from "react";

const PLAN_COLOR = {
  FREE: "#9ca3af", PLUS: "#93c5fd", PRO: "#6ee7b7", MAX: "#c4b5fd",
};

const STATUS_BADGE = {
  ACTIVE:    { bg: "rgba(29,233,168,.14)",  fg: "#6ee7b7" },
  TRIALING:  { bg: "rgba(79,156,249,.14)",  fg: "#93c5fd" },
  PAST_DUE:  { bg: "rgba(245,166,35,.14)",  fg: "#fbbf24" },
  EXPIRED:   { bg: "rgba(242,88,88,.14)",   fg: "#fca5a5" },
  CANCELLED: { bg: "rgba(110,110,110,.14)", fg: "#9ca3af" },
};

function StatusBadge({ status }) {
  const c = STATUS_BADGE[status] || STATUS_BADGE.EXPIRED;
  return (
    <span style={{ background: c.bg, color: c.fg, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
      {status === "TRIALING" ? "TRIAL" : status?.replace("_", " ")}
    </span>
  );
}

function PlanBadge({ plan }) {
  return (
    <span style={{ color: PLAN_COLOR[plan] || "#9ca3af", fontSize: 12, fontWeight: 700, letterSpacing: .4 }}>{plan}</span>
  );
}

const PLAN_KEYS = ["FREE", "PLUS", "PRO", "MAX"];

const FEATURE_KEYS = [
  "hasAiCalling", "hasAdvancedAnalytics", "hasManualReview", "hasDncRegistry",
  "hasTeams", "hasMultiChannel", "hasDealPipeline", "hasIntentTraining",
  "hasCustomAiPrompts", "hasCustomProviders", "hasWebhooks", "hasCustomFields",
  "hasCampaigns", "hasDocuments", "hasConversationMemory", "hasApiAccess",
  "hasWhiteLabel", "hasAiCallDemo",
];

function fmt(n) { return n === -1 || n == null ? "∞" : n.toLocaleString(); }

export function ModernPlanManagementView({ user }) {
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("subscriptions");
  const [actionModal, setActionModal] = useState(null);
  const [form, setForm] = useState({ action: "override_plan", plan: "PRO", days: 30 });
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subsRes] = await Promise.all([
        fetch("/api/admin/plans"),
        fetch("/api/admin/subscription"),
      ]);
      if (plansRes.ok) {
        const d = await plansRes.json();
        setPlans(d.plans || []);
      }
      if (subsRes.ok) {
        const d = await subsRes.json();
        setSubscriptions(d.subscriptions || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function runAction() {
    if (!actionModal) return;
    setActioning(true);
    setActionError("");
    setActionOk(false);
    try {
      const body = { tenantId: actionModal.tenantId, action: form.action };
      if (form.action === "override_plan") body.plan = form.plan;
      if (form.action === "extend_trial")  body.days = Number(form.days);

      const res = await fetch("/api/admin/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || "Action failed"); return; }
      setActionOk(true);
      setTimeout(() => { setActionModal(null); fetchData(); }, 1500);
    } catch (e) { setActionError(e.message); }
    finally { setActioning(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4 }}>
        {[["subscriptions", "Active Subscriptions"], ["plans", "Plan Definitions"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{
              padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
              background: activeTab === key ? "var(--ms-accent)" : "var(--ms-bg3)",
              color: activeTab === key ? "var(--ms-bg)" : "var(--ms-text2)",
            }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ms-card" style={{ textAlign: "center", padding: 60, color: "var(--ms-text2)" }}>Loading…</div>
      ) : activeTab === "subscriptions" ? (
        <div className="ms-card">
          <table className="ms-tbl" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Billing</th>
                <th>Period End</th>
                <th>Trial Ends</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ms-text3)", padding: "32px 0" }}>No subscriptions found</td></tr>
              ) : subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td>
                    <div style={{ fontSize: 13, color: "var(--ms-text)", fontWeight: 500 }}>{sub.tenant?.name || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--ms-text3)" }}>{sub.tenant?.slug}</div>
                  </td>
                  <td><PlanBadge plan={sub.plan} /></td>
                  <td><StatusBadge status={sub.status} /></td>
                  <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{sub.billingCycle || "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--ms-text2)" }}>
                    {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--ms-text2)" }}>
                    {sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    <button
                      onClick={() => { setActionModal({ tenantId: sub.tenantId, tenantName: sub.tenant?.name }); setActionError(""); setActionOk(false); }}
                      style={{
                        padding: "4px 12px", borderRadius: 6, border: "1px solid var(--ms-border2)",
                        background: "transparent", color: "var(--ms-text2)", fontSize: 12, cursor: "pointer",
                      }}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Plan Definitions — comparison table (plans as columns) */
        <div className="ms-card" style={{ overflowX: "auto" }}>
          {(() => {
            const plansByKey = Object.fromEntries(plans.map((p) => [p.plan, p]));
            const orderedPlans = PLAN_KEYS.map((k) => plansByKey[k]).filter(Boolean);

            const limitRows = [
              ["Users",           "maxUsers"],
              ["Customers",       "maxCustomers"],
              ["AI Calls / mo",   "maxAiCallsPerMonth"],
              ["Lead Uploads / mo","maxLeadUploadsPerMonth"],
              ["Teams",           "maxTeams"],
              ["Webhooks",        "maxWebhooks"],
              ["Custom Fields",   "maxCustomFields"],
              ["Storage (MB)",    "maxStorageMb"],
            ];

            const featureLabel = (k) => k.replace(/^has/, "").replace(/([A-Z])/g, " $1").trim();

            const cellStyle = { fontSize: 13, color: "var(--ms-text)", fontVariantNumeric: "tabular-nums", textAlign: "center" };
            const labelStyle = { fontSize: 12, color: "var(--ms-text2)", fontWeight: 500, whiteSpace: "nowrap" };
            const sectionStyle = { fontSize: 10, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, paddingTop: 20 };

            return (
              <table className="ms-tbl" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: 180 }}></th>
                    {orderedPlans.map((p) => (
                      <th key={p.plan} style={{ textAlign: "center" }}>
                        <PlanBadge plan={p.plan} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Name */}
                  <tr>
                    <td style={labelStyle}>Name</td>
                    {orderedPlans.map((p) => <td key={p.plan} style={cellStyle}>{p.name}</td>)}
                  </tr>

                  {/* Pricing section */}
                  <tr><td colSpan={orderedPlans.length + 1} style={sectionStyle}>Pricing</td></tr>
                  <tr>
                    <td style={labelStyle}>Monthly (USD)</td>
                    {orderedPlans.map((p) => <td key={p.plan} style={cellStyle}>${p.monthlyPriceUsd}</td>)}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Annual (USD)</td>
                    {orderedPlans.map((p) => <td key={p.plan} style={cellStyle}>${p.annualPriceUsd}</td>)}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Monthly (INR)</td>
                    {orderedPlans.map((p) => <td key={p.plan} style={cellStyle}>₹{p.monthlyPriceInr}</td>)}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Annual (INR)</td>
                    {orderedPlans.map((p) => <td key={p.plan} style={cellStyle}>₹{p.annualPriceInr}</td>)}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Trial</td>
                    {orderedPlans.map((p) => (
                      <td key={p.plan} style={{ textAlign: "center" }}>
                        {p.trialDays > 0 ? (
                          <span style={{ background: "rgba(79,156,249,.12)", color: "#93c5fd", padding: "2px 8px", borderRadius: 99, fontSize: 11 }}>
                            {p.trialDays}d
                          </span>
                        ) : <span style={{ color: "var(--ms-text3)", fontSize: 12 }}>—</span>}
                      </td>
                    ))}
                  </tr>

                  {/* Limits section */}
                  <tr><td colSpan={orderedPlans.length + 1} style={sectionStyle}>Limits</td></tr>
                  {limitRows.map(([label, key]) => (
                    <tr key={key}>
                      <td style={labelStyle}>{label}</td>
                      {orderedPlans.map((p) => <td key={p.plan} style={{ ...cellStyle, fontWeight: 500 }}>{fmt(p[key])}</td>)}
                    </tr>
                  ))}

                  {/* Features section */}
                  <tr><td colSpan={orderedPlans.length + 1} style={sectionStyle}>Features</td></tr>
                  {FEATURE_KEYS.map((key) => (
                    <tr key={key}>
                      <td style={labelStyle}>{featureLabel(key)}</td>
                      {orderedPlans.map((p) => (
                        <td key={p.plan} style={{ textAlign: "center", fontSize: 14 }}>
                          {p[key]
                            ? <span style={{ color: "var(--ms-accent)" }}>✓</span>
                            : <span style={{ color: "var(--ms-text3)" }}>✗</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 9999,
        }}
          onClick={(e) => e.target === e.currentTarget && setActionModal(null)}>
          <div style={{ background: "var(--ms-surface)", border: "1px solid var(--ms-border)", borderRadius: 16, padding: 28, width: 400, maxWidth: "90vw" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ms-text)", marginBottom: 4 }}>
              Manage Subscription
            </div>
            <div style={{ fontSize: 12, color: "var(--ms-text3)", marginBottom: 20 }}>
              {actionModal.tenantName}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>Action</label>
              <select value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", background: "var(--ms-bg3)", border: "1px solid var(--ms-border)", borderRadius: 8, color: "var(--ms-text)", fontSize: 13 }}>
                <option value="override_plan">Override Plan</option>
                <option value="extend_trial">Extend Trial</option>
                <option value="downgrade">Downgrade to FREE</option>
              </select>
            </div>

            {form.action === "override_plan" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>Plan</label>
                <select value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", background: "var(--ms-bg3)", border: "1px solid var(--ms-border)", borderRadius: 8, color: "var(--ms-text)", fontSize: 13 }}>
                  {PLAN_KEYS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}

            {form.action === "extend_trial" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: "var(--ms-text2)" }}>Additional Days</label>
                <input type="number" value={form.days} min={1} max={365}
                  onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", background: "var(--ms-bg3)", border: "1px solid var(--ms-border)", borderRadius: 8, color: "var(--ms-text)", fontSize: 13 }} />
              </div>
            )}

            {form.action === "downgrade" && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(242,88,88,.1)", borderRadius: 8, fontSize: 13, color: "#fca5a5" }}>
                This will immediately downgrade the tenant to FREE, suspend extra users, and pause campaigns.
              </div>
            )}

            {actionError && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(242,88,88,.12)", color: "#fca5a5", borderRadius: 8, fontSize: 13 }}>
                {actionError}
              </div>
            )}
            {actionOk && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(29,233,168,.12)", color: "#6ee7b7", borderRadius: 8, fontSize: 13 }}>
                Action applied successfully.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setActionModal(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--ms-border)", background: "transparent", color: "var(--ms-text2)", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={runAction} disabled={actioning}
                className="ms-btn ms-btn-primary" style={{ minWidth: 100 }}>
                {actioning ? "Running…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
