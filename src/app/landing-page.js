"use client";

import { useEffect } from "react";
import Link from "next/link";
import "@/components/shells/modern/modern-shell.css";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "WrenForge CRM";

const PLANS = [
  {
    key: "FREE",
    name: "Free",
    usd: "$0",
    inr: "₹0",
    period: "/mo",
    badge: null,
    features: [
      "100 AI calling credits",
      "1 user seat",
      "100 customers",
      "AI voice calling",
      "Basic call logs",
      "Email support",
    ],
  },
  {
    key: "PLUS",
    name: "Plus",
    usd: "$9",
    inr: "₹699",
    period: "/mo",
    badge: "Popular",
    badgeColor: "var(--ms-amber)",
    features: [
      "200 AI calling credits",
      "3 user seats",
      "1,000 customers",
      "Campaign automation",
      "Team management",
      "Webhooks & integrations",
    ],
  },
  {
    key: "PRO",
    name: "Pro",
    usd: "$29",
    inr: "₹1,999",
    period: "/mo",
    badge: "Best Value",
    badgeColor: "var(--ms-accent)",
    trial: "30-day free trial",
    features: [
      "500 AI calling credits",
      "10 user seats",
      "10,000 customers",
      "Advanced analytics",
      "Deal pipeline",
      "White-label branding",
    ],
  },
  {
    key: "MAX",
    name: "Max",
    usd: "$79",
    inr: "₹5,999",
    period: "/mo",
    badge: null,
    features: [
      "1,000 AI calling credits",
      "100 user seats",
      "100,000 customers",
      "Intent training",
      "Full API access",
      "Priority support",
    ],
  },
];

const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l1.06-1.06a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
        <path d="M14.5 2a4.5 4.5 0 0 1 4.5 4.5"/>
        <path d="M14.5 5a1.5 1.5 0 0 1 1.5 1.5"/>
      </svg>
    ),
    title: "AI Voice Calling",
    desc: "Automated outbound calls powered by AI. Natural conversations, objection handling, and real-time transcription — at scale.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    title: "Campaign Automation",
    desc: "Build multi-step calling campaigns with smart retry logic, scheduling windows, and follow-up sequences.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Lead Management",
    desc: "Import leads via CSV, score them with AI, track deal stages, and keep your entire pipeline organised in one place.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    title: "Analytics & Insights",
    desc: "Real-time dashboards with call success rates, conversion funnels, team performance metrics, and AI scoring history.",
  },
];

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", "dark");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--ms-bg)",
        color: "var(--ms-text)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* ── NAV ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: "1px solid var(--ms-border)",
          background: "rgba(11,10,15,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--ms-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ms-bg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l1.06-1.06a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>{APP_NAME}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link
              href="/login"
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ms-text2)",
                textDecoration: "none",
                border: "1px solid var(--ms-border2)",
                background: "transparent",
                transition: "color .15s, border-color .15s",
              }}
            >
              Sign In
            </Link>
            <Link
              href="/register"
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ms-bg)",
                textDecoration: "none",
                background: "var(--ms-accent)",
              }}
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          padding: "96px 24px 80px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -60,
            left: "50%",
            transform: "translateX(-50%)",
            width: 700,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(96,165,250,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 14px",
              borderRadius: 20,
              border: "1px solid var(--ms-accent-dim)",
              background: "rgba(96,165,250,0.08)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ms-accent)",
              marginBottom: 28,
              letterSpacing: "0.03em",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--ms-accent)",
                display: "inline-block",
              }}
            />
            NOW WITH AI-POWERED CALLING
          </div>
          <h1
            style={{
              fontSize: "clamp(36px, 6vw, 58px)",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "var(--ms-text)",
              margin: "0 0 20px",
            }}
          >
            {APP_NAME}
          </h1>
          <p
            style={{
              fontSize: "clamp(16px, 2.5vw, 20px)",
              color: "var(--ms-text2)",
              lineHeight: 1.6,
              margin: "0 0 40px",
              maxWidth: 540,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            AI-powered CRM for modern sales teams. Automate outbound calling, manage your pipeline, and close more deals — all in one place.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
            }}
          >
            <Link
              href="/register"
              style={{
                padding: "13px 28px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                color: "var(--ms-bg)",
                textDecoration: "none",
                background: "var(--ms-accent)",
                boxShadow: "0 4px 24px rgba(96,165,250,0.25)",
              }}
            >
              Start Free Trial
            </Link>
            <Link
              href="/login"
              style={{
                padding: "13px 28px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--ms-text)",
                textDecoration: "none",
                border: "1px solid var(--ms-border2)",
                background: "var(--ms-surface)",
              }}
            >
              Sign In
            </Link>
          </div>
          <p
            style={{
              marginTop: 20,
              fontSize: 12,
              color: "var(--ms-text3)",
            }}
          >
            No credit card required &nbsp;·&nbsp; 30-day free trial on Pro &nbsp;·&nbsp; Cancel anytime
          </p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "64px 24px", background: "var(--ms-bg2)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2
              style={{
                fontSize: "clamp(24px, 4vw, 36px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: "0 0 12px",
              }}
            >
              Everything your sales team needs
            </h2>
            <p style={{ fontSize: 15, color: "var(--ms-text2)", margin: 0 }}>
              From first call to closed deal — built for speed, built for scale.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
            }}
          >
            {FEATURES.map((f) => (
              <div
                key={f.title}
                style={{
                  background: "var(--ms-surface)",
                  border: "1px solid var(--ms-border)",
                  borderRadius: 12,
                  padding: "24px 22px",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "var(--ms-accent-dim)",
                    color: "var(--ms-accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                    flexShrink: 0,
                  }}
                >
                  {f.icon}
                </div>
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    margin: "0 0 8px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: 13, color: "var(--ms-text2)", lineHeight: 1.6, margin: 0 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2
              style={{
                fontSize: "clamp(24px, 4vw, 36px)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: "0 0 12px",
              }}
            >
              Simple, transparent pricing
            </h2>
            <p style={{ fontSize: 15, color: "var(--ms-text2)", margin: 0 }}>
              Start free, upgrade as you grow. All plans include AI calling.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 20,
              alignItems: "start",
            }}
          >
            {PLANS.map((plan) => {
              const isHighlighted = plan.key === "PRO";
              return (
                <div
                  key={plan.key}
                  style={{
                    background: isHighlighted ? "var(--ms-accent-dim)" : "var(--ms-surface)",
                    border: isHighlighted
                      ? "1.5px solid var(--ms-accent)"
                      : "1px solid var(--ms-border)",
                    borderRadius: 14,
                    padding: "28px 24px 24px",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {plan.badge && (
                    <div
                      style={{
                        position: "absolute",
                        top: -11,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: plan.badgeColor,
                        color: plan.key === "PRO" ? "var(--ms-bg)" : "var(--ms-bg)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        padding: "3px 10px",
                        borderRadius: 20,
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                      }}
                    >
                      {plan.badge}
                    </div>
                  )}

                  <div style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: isHighlighted ? "var(--ms-accent)" : "var(--ms-text3)",
                      }}
                    >
                      {plan.name}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 2,
                      margin: "8px 0 4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        letterSpacing: "-0.03em",
                        color: "var(--ms-text)",
                      }}
                    >
                      {plan.usd}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--ms-text3)", marginLeft: 2 }}>
                      {plan.period}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--ms-text3)", marginBottom: 6 }}>
                    {plan.inr}{plan.period} &nbsp;·&nbsp; INR billing
                  </div>

                  {plan.trial && (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--ms-green)",
                        background: "var(--ms-green-dim)",
                        padding: "3px 8px",
                        borderRadius: 6,
                        display: "inline-block",
                        marginBottom: 16,
                      }}
                    >
                      {plan.trial}
                    </div>
                  )}

                  <div
                    style={{
                      height: 1,
                      background: "var(--ms-border)",
                      margin: "16px 0",
                    }}
                  />

                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "0 0 24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      flex: 1,
                    }}
                  >
                    {plan.features.map((feat) => (
                      <li
                        key={feat}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          fontSize: 13,
                          color: "var(--ms-text2)",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--ms-accent)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ flexShrink: 0, marginTop: 1 }}
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {feat}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/register"
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: "10px 0",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: "none",
                      background: isHighlighted ? "var(--ms-accent)" : "var(--ms-bg3)",
                      color: isHighlighted ? "var(--ms-bg)" : "var(--ms-text)",
                      border: isHighlighted ? "none" : "1px solid var(--ms-border2)",
                    }}
                  >
                    Get Started
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          borderTop: "1px solid var(--ms-border)",
          background: "var(--ms-bg2)",
          padding: "32px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--ms-text3)" }}>
            &copy; 2025 WrenForge. All rights reserved.
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {["Privacy", "Terms", "Contact"].map((label) => (
              <Link
                key={label}
                href={`/${label.toLowerCase()}`}
                style={{
                  fontSize: 13,
                  color: "var(--ms-text3)",
                  textDecoration: "none",
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
