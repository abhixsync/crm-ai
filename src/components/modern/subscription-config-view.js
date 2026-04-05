"use client";

import { useCallback, useEffect, useState } from "react";

function Toggle({ value, onChange }) {
  const on = value === "true" || value === true;
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative",
        background: on ? "var(--ms-accent)" : "var(--ms-bg4)", transition: "background .2s",
      }}>
      <span style={{
        position: "absolute", top: 3, left: on ? 22 : 2, width: 18, height: 18,
        borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left .2s",
      }} />
    </button>
  );
}

const CURRENCY_OPTIONS = [
  { value: "INR", label: "INR (₹)", provider: "Razorpay" },
  { value: "USD", label: "USD ($)", provider: "Stripe" },
];

const CONFIG_FIELDS = [
  { key: "trial_days",         label: "Trial Duration (days)",     type: "number", hint: "Default free-trial length for new signups" },
  { key: "grace_period_days",  label: "Grace Period (days)",        type: "number", hint: "Days before hard-lock after expiry or cancellation" },
  { key: "stripe_enabled",     label: "Stripe Payments",            type: "boolean", hint: "Enable Stripe checkout for USD billing" },
  { key: "razorpay_enabled",   label: "Razorpay Payments",          type: "boolean", hint: "Enable Razorpay checkout for INR billing" },
];

export function ModernSubscriptionConfigView({ user }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/subscription");
      if (res.ok) {
        const data = await res.json();
        setConfig({
          trial_days: "30",
          grace_period_days: "7",
          stripe_enabled: "false",
          razorpay_enabled: "false",
          currency: "INR",
          ...Object.fromEntries((data.config || []).map((c) => [c.key, String(c.value)])),
        });
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  function handleChange(key, val) {
    setConfig((c) => ({ ...c, [key]: String(val) }));
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Save failed"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-grid-2" style={{ alignItems: "start" }}>
        {/* Settings card */}
        <div className="ms-card" style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 20 }}>
            Global Subscription Settings
          </div>

          {loading ? (
            <div style={{ color: "var(--ms-text2)", padding: 20 }}>Loading…</div>
          ) : (
            <>
              {/* Currency selector */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid var(--ms-border)" }}>
                <div>
                  <div style={{ fontSize: 14, color: "var(--ms-text)", fontWeight: 500 }}>Platform Currency</div>
                  <div style={{ fontSize: 12, color: "var(--ms-text3)", marginTop: 2 }}>
                    {config.currency === "INR" ? "Razorpay (INR)" : "Stripe (USD)"} — controls billing provider and pricing display across the platform
                  </div>
                </div>
                <div className="ms-pill-tabs">
                  {CURRENCY_OPTIONS.map((opt) => (
                    <button key={opt.value}
                      className={`ms-pill-tab ms-pill-tab-sm${config.currency === opt.value ? " active" : ""}`}
                      onClick={() => handleChange("currency", opt.value)}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {CONFIG_FIELDS.map(({ key, label, type, hint }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid var(--ms-border)" }}>
                  <div>
                    <div style={{ fontSize: 14, color: "var(--ms-text)", fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 12, color: "var(--ms-text3)", marginTop: 2 }}>{hint}</div>
                  </div>
                  {type === "boolean" ? (
                    <Toggle value={config[key]} onChange={(v) => handleChange(key, v)} />
                  ) : (
                    <input
                      className="ms-field-inp"
                      type="number"
                      value={config[key] || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      min={0}
                      style={{ width: 80, textAlign: "right" }}
                    />
                  )}
                </div>
              ))}

              {error && (
                <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(242,88,88,.12)", color: "#fca5a5", borderRadius: 8, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  onClick={save}
                  disabled={saving}
                  className="ms-btn ms-btn-pri"
                  style={{ minWidth: 120 }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                {saved && <span style={{ fontSize: 13, color: "var(--ms-accent)" }}>Saved ✓</span>}
              </div>
            </>
          )}
        </div>

        {/* Env vars card */}
        <div className="ms-card" style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>
            Environment Variables Required
          </div>
          <pre style={{ color: "var(--ms-text3)", fontFamily: "var(--font-geist-mono, monospace)", background: "var(--ms-bg3)", padding: "12px 16px", borderRadius: 8, fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>
{`# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PLUS_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_MAX_MONTHLY=price_...

# Razorpay
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_PRO_MONTHLY=plan_...`}
          </pre>
        </div>
      </div>
    </div>
  );
}
