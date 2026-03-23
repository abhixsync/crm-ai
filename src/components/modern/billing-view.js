"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const PLAN_COLOR = {
  FREE: { bg: "rgba(110,110,110,.14)", fg: "#9ca3af", border: "rgba(110,110,110,.3)" },
  PLUS: { bg: "rgba(79,156,249,.14)", fg: "#93c5fd", border: "rgba(79,156,249,.3)" },
  PRO:  { bg: "rgba(29,233,168,.14)", fg: "#6ee7b7", border: "rgba(29,233,168,.3)" },
  MAX:  { bg: "rgba(167,139,250,.14)", fg: "#c4b5fd", border: "rgba(167,139,250,.3)" },
};

const STATUS_COLOR = {
  ACTIVE:   { bg: "rgba(29,233,168,.14)", fg: "#6ee7b7" },
  TRIALING: { bg: "rgba(79,156,249,.14)", fg: "#93c5fd" },
  PAST_DUE: { bg: "rgba(245,166,35,.14)", fg: "#fbbf24" },
  EXPIRED:  { bg: "rgba(242,88,88,.14)",  fg: "#fca5a5" },
  CANCELLED:{ bg: "rgba(110,110,110,.14)", fg: "#9ca3af" },
};

function fmt(n) { return n == null || n === -1 ? "Unlimited" : n.toLocaleString(); }

function UsageBar({ label, used, max }) {
  if (max == null) return null;
  const unlimited = max === -1;
  const pct = unlimited ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  const danger = !unlimited && pct >= 90;
  const warn   = !unlimited && pct >= 70 && pct < 90;
  const color  = danger ? "#f25858" : warn ? "#f5a623" : "var(--ms-accent)";

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: "var(--ms-text)" }}>{label}</span>
        <span style={{ color: danger ? "#f25858" : "var(--ms-text2)" }}>
          {unlimited ? `${used.toLocaleString()} / ∞` : `${used.toLocaleString()} / ${max.toLocaleString()}`}
        </span>
      </div>
      {!unlimited && (
        <div style={{ height: 6, borderRadius: 3, background: "var(--ms-border)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color, transition: "width .3s" }} />
        </div>
      )}
    </div>
  );
}

function PlanBadge({ plan }) {
  const c = PLAN_COLOR[plan] || PLAN_COLOR.FREE;
  return (
    <span style={{
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, letterSpacing: .4,
    }}>{plan}</span>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.EXPIRED;
  return (
    <span style={{ background: c.bg, color: c.fg, padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
      {status === "TRIALING" ? "TRIAL" : status?.replace("_", " ")}
    </span>
  );
}

function FeatureCheck({ enabled, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ color: enabled ? "var(--ms-accent)" : "var(--ms-text3)", fontSize: 15 }}>
        {enabled ? "✓" : "✗"}
      </span>
      <span style={{ fontSize: 13, color: enabled ? "var(--ms-text)" : "var(--ms-text3)" }}>{label}</span>
    </div>
  );
}

export function ModernBillingView({ user }) {
  const { data: session } = useSession();
  const [summary, setSummary] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(null);
  const [error, setError] = useState("");
  const [billingCycle, setBillingCycle] = useState("MONTHLY");
  const [currency, setCurrency] = useState("INR");

  // Provider is derived from currency — not user-selectable
  const provider = currency === "USD" ? "stripe" : "razorpay";
  const currencySymbol = currency === "USD" ? "$" : "₹";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscription/summary");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setSubscription(data.subscription);
        setPlans(data.plans || []);
        if (data.currency) setCurrency(data.currency);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function startUpgrade(planKey) {
    setError("");
    setUpgrading(planKey);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey, billingCycle, provider }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Checkout failed"); return; }

      if (data.url) {
        window.location.href = data.url;
      } else if (data.subscriptionId) {
        openRazorpay(data);
      }
    } catch (e) { setError(e.message); }
    finally { setUpgrading(null); }
  }

  function openRazorpay({ subscriptionId, razorpayKeyId }) {
    const options = {
      key:             razorpayKeyId,
      subscription_id: subscriptionId,
      name:            "CRM AI",
      description:     `${billingCycle} subscription`,
      handler: function () {
        fetchData();
        alert("Payment successful! Your plan will be updated shortly.");
      },
      prefill: {
        email: session?.user?.email || "",
        name:  session?.user?.name  || "",
      },
      theme: { color: "#1DE9A8" },
    };

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => { new window.Razorpay(options).open(); };
    document.body.appendChild(script);
  }

  const activeUser = session?.user || user;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {loading ? (
        <div className="ms-card" style={{ textAlign: "center", padding: 60, color: "var(--ms-text2)" }}>
          Loading billing info…
        </div>
      ) : (
        <>
          {/* Current Plan + Usage row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="ms-card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14 }}>
                Current Plan
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <PlanBadge plan={summary?.plan || "FREE"} />
                <StatusBadge status={summary?.status || "ACTIVE"} />
                {summary?.isTrialing && summary?.daysLeft > 0 && (
                  <span style={{ fontSize: 12, color: "#fbbf24" }}>
                    {summary.daysLeft}d trial left
                  </span>
                )}
              </div>
              {subscription?.currentPeriodEnd && (
                <div style={{ fontSize: 13, color: "var(--ms-text2)" }}>
                  Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              )}
              {subscription?.trialEndsAt && summary?.isTrialing && (
                <div style={{ fontSize: 13, color: "var(--ms-text2)" }}>
                  Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              )}
              {subscription?.billingProvider && (
                <div style={{ fontSize: 12, color: "var(--ms-text3)", marginTop: 8 }}>
                  via {subscription.billingProvider}
                </div>
              )}
            </div>

            <div className="ms-card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14 }}>
                Usage This Month
              </div>
              <UsageBar label="Customers"    used={summary?.usage?.customers      || 0} max={summary?.limits?.maxCustomers} />
              <UsageBar label="Team Members"  used={summary?.usage?.users          || 0} max={summary?.limits?.maxUsers} />
              <UsageBar label="AI Calls"      used={summary?.usage?.aiCallsUsed    || 0} max={summary?.limits?.maxAiCallsPerMonth} />
              <UsageBar label="Lead Uploads"  used={summary?.usage?.leadsUploaded  || 0} max={summary?.limits?.maxLeadUploadsPerMonth} />
            </div>
          </div>

          {/* Features */}
          {summary?.plan && summary.plan !== "FREE" && (
            <div className="ms-card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>
                Plan Features
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0 24px" }}>
                {[
                  ["hasAiCalling", "AI Calling"],
                  ["hasAdvancedAnalytics", "Advanced Analytics"],
                  ["hasManualReview", "Manual Review"],
                  ["hasDncRegistry", "DNC Registry"],
                  ["hasTeams", "Teams"],
                  ["hasMultiChannel", "Multi-channel"],
                  ["hasDealPipeline", "Deal Pipeline"],
                  ["hasIntentTraining", "Intent Training"],
                  ["hasCustomAiPrompts", "Custom AI Prompts"],
                  ["hasCustomProviders", "Custom AI Providers"],
                  ["hasWebhooks", "Webhooks"],
                  ["hasCustomFields", "Custom Fields"],
                  ["hasCampaigns", "Campaigns"],
                  ["hasDocuments", "Documents"],
                  ["hasConversationMemory", "Conversation Memory"],
                  ["hasApiAccess", "API Access"],
                  ["hasWhiteLabel", "White Label"],
                ].map(([key, label]) => (
                  <FeatureCheck key={key} enabled={subscription?.planSnapshot?.[key] ?? false} label={label} />
                ))}
              </div>
            </div>
          )}

          {/* Upgrade Options */}
          <div className="ms-card" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                Upgrade Plan
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="ms-pill-tabs">
                  {["MONTHLY", "ANNUAL"].map((c) => (
                    <button key={c} onClick={() => setBillingCycle(c)}
                      className={`ms-pill-tab ms-pill-tab-sm${billingCycle === c ? " active" : ""}`}>
                      {c === "ANNUAL" ? "Annual (save 20%)" : "Monthly"}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: "var(--ms-text3)", padding: "4px 8px", background: "var(--ms-bg3)", borderRadius: 5 }}>
                  {currency} via {provider === "stripe" ? "Stripe" : "Razorpay"}
                </span>
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(242,88,88,.12)", color: "#fca5a5", borderRadius: 8, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {plans.filter(p => p.plan !== "FREE").map((plan) => {
                const c = PLAN_COLOR[plan.plan] || PLAN_COLOR.FREE;
                const isCurrent = summary?.plan === plan.plan;
                const price = currency === "INR"
                  ? (billingCycle === "ANNUAL" ? plan.annualPriceInr : plan.monthlyPriceInr)
                  : (billingCycle === "ANNUAL" ? plan.annualPriceUsd : plan.monthlyPriceUsd);
                const isUpgrading = upgrading === plan.plan;

                return (
                  <div key={plan.plan} style={{
                    border: `1px solid ${isCurrent ? c.border : "var(--ms-border)"}`,
                    borderRadius: 12, padding: "20px 20px 16px",
                    background: isCurrent ? c.bg : "var(--ms-bg3)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <PlanBadge plan={plan.plan} />
                      {plan.trialDays > 0 && !isCurrent && (
                        <span style={{ fontSize: 10, background: "rgba(79,156,249,.14)", color: "#93c5fd", padding: "2px 8px", borderRadius: 99 }}>
                          {plan.trialDays}d trial
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ms-text)", margin: "12px 0 4px" }}>
                      {currencySymbol}{price ?? "—"}<span style={{ fontSize: 13, fontWeight: 400, color: "var(--ms-text2)" }}>/{billingCycle === "ANNUAL" ? "yr" : "mo"}</span>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--ms-text3)", marginBottom: 16 }}>
                      {fmt(plan.maxCustomers)} customers · {fmt(plan.maxUsers)} users · {fmt(plan.maxAiCallsPerMonth)} AI calls
                    </div>

                    <button
                      className={isCurrent ? "ms-btn" : "ms-btn ms-btn-pri"}
                      onClick={() => !isCurrent && startUpgrade(plan.plan)}
                      disabled={isCurrent || !!isUpgrading}
                      style={{
                        width: "100%", justifyContent: "center",
                        ...(isCurrent
                          ? { color: c.fg, borderColor: c.border, cursor: "default" }
                          : { background: c.fg, color: "#0B0A0F", borderColor: c.fg }),
                        opacity: isUpgrading ? .7 : 1,
                      }}>
                      {isUpgrading ? "Processing…" : isCurrent ? "Current Plan" : `Upgrade to ${plan.plan}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invoice History */}
          {subscription?.invoices?.length > 0 && (
            <div className="ms-card">
              <div className="ms-card-hd">
                <span className="ms-card-title">Billing History</span>
              </div>
              <table className="ms-tbl" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Currency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subscription.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontSize: 13, color: "var(--ms-text2)" }}>
                        {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--ms-text)" }}>{inv.description || "Subscription payment"}</td>
                      <td style={{ fontSize: 13, color: "var(--ms-text)", fontVariantNumeric: "tabular-nums" }}>
                        {inv.amountUsd != null
                          ? `$${Number(inv.amountUsd).toFixed(2)}`
                          : inv.amountInr != null
                            ? `₹${Number(inv.amountInr).toFixed(2)}`
                            : "—"}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--ms-text3)" }}>{inv.currency?.toUpperCase() || "USD"}</td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
                          background: inv.status === "PAID" ? "rgba(29,233,168,.14)" : "rgba(242,88,88,.14)",
                          color: inv.status === "PAID" ? "#6ee7b7" : "#fca5a5",
                        }}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
