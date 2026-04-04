"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import "@/components/shells/modern/modern-shell.css";

export default function RegisterForm({ theme = {} }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [doneEmail, setDoneEmail] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", localStorage.getItem("ms-ui-theme") || "dark");
  }, []);

  function onChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Registration failed.");
        setLoading(false);
        return;
      }

      if (res.ok && data.slug) {
        const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "wrenforge.com";
        window.location.href = `https://${data.slug}.${appDomain}/login?welcome=1`;
        return;
      }

      setDoneEmail(form.email);
      setDone(true);
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  }

  const bgStyle = theme.loginBackgroundUrl
    ? { backgroundImage: `url(${theme.loginBackgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;

  if (done) {
    return (
      <div className="ms-login" style={bgStyle}>
        <div className="ms-login-card" style={{ textAlign: "center" }}>
          {theme.logoUrl && (
            <div className="ms-login-logo">
              <img src={theme.logoUrl} alt="Logo" />
            </div>
          )}
          <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
          <div className="ms-login-title">Check your inbox</div>
          <div className="ms-login-subtitle" style={{ marginTop: 8 }}>
            We sent a verification link to <strong>{doneEmail}</strong>.
            <br />Click it to activate your 30-day Pro trial.
          </div>
          <div style={{ marginTop: 24 }}>
            <Link href="/login" className="ms-login-btn" style={{ display: "inline-block", textDecoration: "none" }}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-login" style={bgStyle}>
      <div className="ms-login-card" style={{ maxWidth: 440 }}>
        {theme.logoUrl && (
          <div className="ms-login-logo">
            <img src={theme.logoUrl} alt="Logo" />
          </div>
        )}
        <div className="ms-login-title">Start your free trial</div>
        <div className="ms-login-subtitle">
          30 days of Pro — no credit card required
        </div>

        <form className="ms-login-form" onSubmit={onSubmit}>
          <input
            className="ms-login-input"
            type="text"
            name="name"
            placeholder="Your full name"
            value={form.name}
            onChange={onChange}
            required
            autoComplete="name"
          />
          <input
            className="ms-login-input"
            type="email"
            name="email"
            placeholder="Work email"
            value={form.email}
            onChange={onChange}
            required
            autoComplete="email"
          />
          <input
            className="ms-login-input"
            type="password"
            name="password"
            placeholder="Password (min 8 characters)"
            value={form.password}
            onChange={onChange}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <input
            className="ms-login-input"
            type="text"
            name="company"
            placeholder="Company name"
            value={form.company}
            onChange={onChange}
            required
          />
          <input
            className="ms-login-input"
            type="tel"
            name="phone"
            placeholder="Phone number (optional)"
            value={form.phone}
            onChange={onChange}
          />
          <button className="ms-login-btn" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Start Free Trial"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted, #706C78)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent, #1DE9A8)", textDecoration: "none" }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
