"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import "@/components/shells/modern/modern-shell.css";

export default function ResetPasswordForm({ token }) {
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", "light");
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (!token) { setError("Missing reset token. Please use the link from your email."); return; }
    if (password.length < 12) { setError("Password must be at least 12 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError("");
    setLoading(true);

    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setSuccess(true);
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
        <div className="ms-login-title">Reset your password</div>

        {success ? (
          <>
            <div className="ms-login-subtitle" style={{ marginBottom: 0 }}>
              Password updated —{" "}
              <Link href="/login" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
                sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="ms-login-subtitle">Choose a new password for your account.</div>
            <form className="ms-login-form" onSubmit={onSubmit}>
              <input
                className="ms-login-input"
                type="password"
                placeholder="New password (min 12 characters)"
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <input
                className="ms-login-input"
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {error && (
                <div style={{ fontSize: 12, color: "#f87171", marginTop: -4 }}>{error}</div>
              )}
              <button className="ms-login-btn" type="submit" disabled={loading}>
                {loading ? "Resetting…" : "Reset password"}
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
