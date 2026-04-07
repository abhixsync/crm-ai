"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import "@/components/shells/modern/modern-shell.css";

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", "light");
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Invite token is missing. Please use the link from your invitation email.");
      return;
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Unable to accept invite. Please try again.");
        return;
      }

      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="ms-login">
        <div className="ms-login-card">
          <div className="ms-login-title">Invalid Invite Link</div>
          <div className="ms-login-subtitle" style={{ color: "var(--ms-error, #EF4444)", marginTop: 8 }}>
            This invite link is missing a token. Please use the original link from your invitation email.
          </div>
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <Link href="/login" style={{ color: "var(--ms-accent)", textDecoration: "none", fontSize: 14 }}>
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="ms-login">
        <div className="ms-login-card">
          <div className="ms-login-title">Account Created</div>
          <div className="ms-login-subtitle" style={{ marginTop: 8 }}>
            Your account has been set up. You can now sign in with your email and the password you just created.
          </div>
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <Link
              href="/login"
              className="ms-login-btn"
              style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-login">
      <div className="ms-login-card">
        <div className="ms-login-title">Accept Invitation</div>
        <div className="ms-login-subtitle">Set a password to activate your account.</div>

        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#EF4444",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <form className="ms-login-form" onSubmit={onSubmit} style={{ marginTop: 16 }}>
          <input
            className="ms-login-input"
            type="password"
            placeholder="New Password (min 12 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <input
            className="ms-login-input"
            type="password"
            placeholder="Confirm Password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <button className="ms-login-btn" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Set Password & Join"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted, #706C78)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
