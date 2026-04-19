"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTenantSwitcher } from "@/components/providers/tenant-switcher-provider";
import { toast } from "sonner";

const PLAN_COLOR = {
  dark: {
    FREE: { bg: "rgba(110,110,110,.14)", fg: "#9ca3af", border: "rgba(110,110,110,.3)" },
    PLUS: { bg: "rgba(79,156,249,.14)",  fg: "#93c5fd", border: "rgba(79,156,249,.3)" },
    PRO:  { bg: "rgba(29,233,168,.14)",  fg: "#6ee7b7", border: "rgba(29,233,168,.3)" },
    MAX:  { bg: "rgba(167,139,250,.14)", fg: "#c4b5fd", border: "rgba(167,139,250,.3)" },
  },
  light: {
    FREE: { bg: "#F1F5F9", fg: "#475569", border: "rgba(71,85,105,.2)" },
    PLUS: { bg: "#EFF6FF", fg: "#1E40AF", border: "rgba(30,64,175,.2)" },
    PRO:  { bg: "#ECFDF5", fg: "#065F46", border: "rgba(6,95,70,.2)" },
    MAX:  { bg: "#F5F3FF", fg: "#5B21B6", border: "rgba(91,33,182,.2)" },
  },
};

const STATUS_COLOR = {
  dark: {
    ACTIVE:    { bg: "rgba(29,233,168,.14)", fg: "#6ee7b7" },
    TRIALING:  { bg: "rgba(79,156,249,.14)", fg: "#93c5fd" },
    PAST_DUE:  { bg: "rgba(245,166,35,.14)", fg: "#fbbf24" },
    EXPIRED:   { bg: "rgba(242,88,88,.14)",  fg: "#fca5a5" },
    CANCELLED: { bg: "rgba(110,110,110,.14)", fg: "#9ca3af" },
  },
  light: {
    ACTIVE:    { bg: "#ECFDF5", fg: "#065F46" },
    TRIALING:  { bg: "#EFF6FF", fg: "#1E40AF" },
    PAST_DUE:  { bg: "#FFFBEB", fg: "#92400E" },
    EXPIRED:   { bg: "#FEF2F2", fg: "#991B1B" },
    CANCELLED: { bg: "#F1F5F9", fg: "#475569" },
  },
};

function useUITheme() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const el = document.documentElement;
    setTheme(el.dataset.uiTheme || "dark");
    const obs = new MutationObserver(() => setTheme(el.dataset.uiTheme || "dark"));
    obs.observe(el, { attributes: true, attributeFilter: ["data-ui-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

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
  const theme = useUITheme();
  const map = PLAN_COLOR[theme] || PLAN_COLOR.dark;
  const c = map[plan] || map.FREE;
  return (
    <span style={{
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, letterSpacing: .4,
    }}>{plan}</span>
  );
}

function StatusBadge({ status }) {
  const theme = useUITheme();
  const map = STATUS_COLOR[theme] || STATUS_COLOR.dark;
  const c = map[status] || map.EXPIRED;
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
  const uiTheme = useUITheme();
  const planColors = PLAN_COLOR[uiTheme] || PLAN_COLOR.dark;
  const { data: session, status } = useSession();
  const { selectedTenantId, isSuperAdmin } = useTenantSwitcher();
  const [summary, setSummary] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(null);
  const [error, setError] = useState("");
  const [billingCycle, setBillingCycle] = useState("MONTHLY");
  const [currency, setCurrency] = useState("INR");

  const [brandName, setBrandName]         = useState("");
  const [primaryColor, setPrimaryColor]   = useState("");

  const [creditBalance, setCreditBalance] = useState(null);
  const [creditPacks, setCreditPacks]     = useState([]);
  const [creditTxns, setCreditTxns]       = useState({ transactions: [], total: 0, page: 1, pages: 1 });
  const [creditLoading, setCreditLoading] = useState(true);

  // Provider is derived from currency — not user-selectable
  const provider = currency === "USD" ? "stripe" : "razorpay";
  const currencySymbol = currency === "USD" ? "$" : "₹";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = {};
      if (isSuperAdmin && selectedTenantId) {
        headers["X-Tenant-ID"] = selectedTenantId;
      }
      const [subRes, themeRes] = await Promise.all([
        fetch("/api/subscription/summary", { headers }),
        fetch("/api/theme/active"),
      ]);
      if (subRes.ok) {
        const data = await subRes.json();
        setSummary(data.summary);
        setSubscription(data.subscription);
        setPlans(data.plans || []);
        if (data.currency) setCurrency(data.currency);
      }
      if (themeRes.ok) {
        const themeData = await themeRes.json();
        if (themeData.brandName) setBrandName(themeData.brandName);
        if (themeData.primaryColor) setPrimaryColor(themeData.primaryColor);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [isSuperAdmin, selectedTenantId]);

  const loadCredits = useCallback(async () => {
    setCreditLoading(true);
    try {
      const [balRes, packsRes, txnsRes] = await Promise.all([
        fetch("/api/credits/balance"),
        fetch("/api/credits/packs"),
        fetch("/api/credits/transactions?limit=10"),
      ]);
      if (balRes.ok)   setCreditBalance(await balRes.json());
      if (packsRes.ok) setCreditPacks((await packsRes.json()).packs || []);
      if (txnsRes.ok)  setCreditTxns(await txnsRes.json());
    } catch { /* silent */ }
    setCreditLoading(false);
  }, []);

  // Wait for session to load before fetching
  useEffect(() => {
    if (status === "loading") return;
    fetchData();
    loadCredits();

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("credit_success")) {
      loadCredits();
    }
  }, [status, fetchData, loadCredits]);

  async function startUpgrade(planKey) {
    setError("");
    setUpgrading(planKey);
    try {
      const hdrs = { "Content-Type": "application/json" };
      if (isSuperAdmin && selectedTenantId) {
        hdrs["X-Tenant-ID"] = selectedTenantId;
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: hdrs,
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
      name:            brandName || process.env.NEXT_PUBLIC_APP_NAME || "CRM AI",
      description:     `${billingCycle} subscription`,
      handler: function () {
        fetchData();
        toast.success("Payment successful! Your plan will be updated shortly.");
      },
      prefill: {
        email: session?.user?.email || "",
        name:  session?.user?.name  || "",
      },
      theme: { color: primaryColor || "#1DE9A8" },
    };

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => { new window.Razorpay(options).open(); };
    document.body.appendChild(script);
  }

  async function handleBuyPack(packId) {
    try {
      const res = await fetch("/api/billing/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Checkout failed");
    } catch {
      alert("Failed to start checkout");
    }
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
          <div className="ms-grid-2">
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
              <UsageBar label="AI Credits"    used={summary?.usage?.aiCallsUsed    || 0} max={summary?.limits?.creditsPerMonth ?? summary?.limits?.maxAiCallsPerMonth} />
              <UsageBar label="Lead Uploads"  used={summary?.usage?.leadsUploaded  || 0} max={summary?.limits?.maxLeadUploadsPerMonth} />
            </div>
          </div>

          {/* Features */}
          {summary?.plan && summary.plan !== "FREE" && (
            <div className="ms-card" style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 12, color: "var(--ms-text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 16 }}>
                Plan Features
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0 24px" }}>
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
            <div className="ms-billing-upgrade-hd" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
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

            <div className="ms-grid-3">
              {plans.filter(p => p.plan !== "FREE").map((plan) => {
                const c = planColors[plan.plan] || planColors.FREE;
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
                      className="ms-btn"
                      onClick={() => !isCurrent && startUpgrade(plan.plan)}
                      disabled={isCurrent || !!isUpgrading}
                      style={{
                        width: "100%", justifyContent: "center",
                        background: c.bg, color: c.fg, borderColor: c.border,
                        cursor: isCurrent ? "default" : "pointer",
                        fontWeight: isCurrent ? 500 : 600,
                        opacity: isUpgrading ? .7 : 1,
                      }}>
                      {isUpgrading ? "Processing…" : isCurrent ? "Current Plan" : `Upgrade to ${plan.plan}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── AI Credits ─────────────────────────────── */}
          <div className="ms-card" style={{ padding: "20px" }}>
            <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "16px" }}>AI Credits</div>

            {creditLoading ? (
              <div style={{ color: "var(--ms-text2)", fontSize: "14px" }}>Loading...</div>
            ) : (
              <>
                {/* Balance summary */}
                {creditBalance && (
                  <div style={{ marginBottom: "20px", padding: "14px", background: "var(--ms-bg2)", borderRadius: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--ms-accent)" }}>
                        {creditBalance.available?.toLocaleString() ?? 0}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--ms-text2)" }}>credits available</span>
                    </div>
                    <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--ms-text2)" }}>
                      <span>Plan: {creditBalance.planCredits?.toLocaleString()}</span>
                      {creditBalance.purchasedCredits > 0 && <span>Purchased: {creditBalance.purchasedCredits?.toLocaleString()}</span>}
                      {creditBalance.reservedCredits > 0 && <span>Reserved: {creditBalance.reservedCredits?.toLocaleString()}</span>}
                    </div>
                    {creditBalance.planResetNextAt && (
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ms-text3, var(--ms-text2))" }}>
                        Plan credits reset {new Date(creditBalance.planResetNextAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Credit packs */}
                {creditPacks.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px" }}>Buy Credits</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
                      {creditPacks.map((pack) => (
                        <div key={pack.id} className="ms-card" style={{ padding: "12px", cursor: "pointer" }}
                          onClick={() => handleBuyPack(pack.id)}>
                          <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "4px" }}>{pack.name}</div>
                          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--ms-accent)", marginBottom: "4px" }}>
                            {pack.credits.toLocaleString()}
                            {pack.bonusCredits > 0 && <span style={{ fontSize: "11px", color: "var(--ms-text2)" }}> +{pack.bonusCredits}</span>}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--ms-text2)", marginBottom: "8px" }}>
                            credits{pack.isRecurring ? "/month" : ""}
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 600 }}>
                            ${Number(pack.priceUsd).toFixed(2)}
                            {pack.isRecurring && <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--ms-text2)" }}>/mo</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent transactions */}
                {creditTxns.transactions.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px" }}>Recent Transactions</div>
                    <table className="ms-tbl" style={{ width: "100%" }}>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditTxns.transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td style={{ fontSize: "12px" }}>{tx.type}</td>
                            <td style={{ fontSize: "12px", color: tx.amount > 0 ? "var(--ms-accent)" : "var(--ms-text2)" }}>
                              {tx.amount > 0 ? "+" : ""}{tx.amount}
                            </td>
                            <td style={{ fontSize: "12px", color: "var(--ms-text2)" }}>
                              {new Date(tx.createdAt).toLocaleDateString()}
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

          {/* Invoice History */}
          {subscription?.invoices?.length > 0 && (
            <div className="ms-card">
              <div className="ms-card-hd">
                <span className="ms-card-title">Billing History</span>
              </div>
              <div className="ms-tbl-wrap"><table className="ms-tbl" style={{ width: "100%" }}>
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
              </table></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
