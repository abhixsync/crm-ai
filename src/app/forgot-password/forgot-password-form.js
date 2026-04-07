"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import "@/components/shells/modern/modern-shell.css";

export default function ForgotPasswordForm() {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", "light");
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setError("Please enter your email address."); return; }
    setError("");
    setLoading(true);

    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ms-login">
      <div className="ms-login-card">
        <div className="ms-login-title">Forgot your password?</div>

        {sent ? (
          <>
            <div className="ms-login-subtitle" style={{ marginBottom: 0 }}>
              Check your email — we sent a reset link.
            </div>
            <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted, #706C78)" }}>
              <Link href="/login" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="ms-login-subtitle">
              Enter your email and we&apos;ll send you a reset link.
            </div>
            <form className="ms-login-form" onSubmit={onSubmit}>
              <input
                className="ms-login-input"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && (
                <div style={{ fontSize: 12, color: "#f87171", marginTop: -4 }}>{error}</div>
              )}
              <button className="ms-login-btn" type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted, #706C78)" }}>
              <Link href="/login" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
