"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import "@/components/shells/modern/modern-shell.css";

export default function RegisterForm({ theme = {}, trialDays = 30 }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [doneEmail, setDoneEmail] = useState("");

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", "light");
  }, []);

  function onChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function validate() {
    const name    = form.name.trim();
    const email   = form.email.trim();
    const { password } = form;
    const company = form.company.trim();
    const phone   = form.phone.trim();

    if (name.length < 2)   return "Full name must be at least 2 characters.";
    if (name.length > 100) return "Full name is too long.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    if (password.length < 12) return "Password must be at least 12 characters.";
    if (password.length > 128) return "Password is too long (max 128 characters).";
    if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must include at least one number.";
    if (!/[!@#$%^&*()_\-+=\[\]{}|;':,./<>?]/.test(password)) return "Password must include at least one special character.";
    if (company.length < 2)   return "Company name must be at least 2 characters.";
    if (company.length > 100) return "Company name is too long.";
    if (phone && !/^[+\d][\d\s\-(). ]{5,19}$/.test(phone)) return "Enter a valid phone number.";
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
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
        const { protocol, host } = window.location;
        const parts = host.split(".");
        const rootDomain = parts.length > 2 ? parts.slice(-2).join(".") : host;
        window.location.href = `${protocol}//${data.slug}.${rootDomain}/login?welcome=1`;
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
            <br />Click it to activate your {trialDays}-day Pro trial.
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
          {trialDays} days of Pro — No Credit Card Required
        </div>

        <form className="ms-login-form" onSubmit={onSubmit}>
          <input
            className="ms-login-input"
            type="text"
            name="name"
            placeholder="Name"
            value={form.name}
            onChange={onChange}
            required
            autoComplete="name"
          />
          <input
            className="ms-login-input"
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={onChange}
            required
            autoComplete="email"
          />
          <input
            className="ms-login-input"
            type="password"
            name="password"
            placeholder="Password (min 12 chars, upper, lower, number, symbol)"
            value={form.password}
            onChange={onChange}
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <input
            className="ms-login-input"
            type="text"
            name="company"
            placeholder="Company Name"
            value={form.company}
            onChange={onChange}
            required
          />
          <input
            className="ms-login-input"
            type="tel"
            name="phone"
            placeholder="Phone Number (optional, e.g. +91 555-123-4567)"
            value={form.phone}
            onChange={onChange}
            minLength={7}
            maxLength={20}
            pattern="[+0-9][0-9 \-(). ]{5,19}"
            title="Enter a valid phone number (digits, spaces, dashes, parentheses)"
          />
          <button className="ms-login-btn" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Start Free Trial"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted, #706C78)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
