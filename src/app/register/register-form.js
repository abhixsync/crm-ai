"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import "@/components/shells/modern/modern-shell.css";

function safeBgUrl(url) {
  if (!url) return undefined;
  const s = String(url).trim();
  // Only allow relative paths, /uploads/, or https:// URLs without special chars
  if (/^(\/[^);\n]*|https:\/\/[^);\n"']+)$/.test(s)) {
    return `url(${s})`;
  }
  return undefined;
}

export default function RegisterForm({ theme = {}, trialDays = 30, googleEnabled = false }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [doneEmail, setDoneEmail] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

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
      setLoading(false);
      setDone(true);
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/auth/complete-signup" });
    } catch {
      toast.error("Google sign-up failed. Please try again.");
      setGoogleLoading(false);
    }
  }

  const bgStyle = theme.loginBackgroundUrl
    ? { backgroundImage: safeBgUrl(theme.loginBackgroundUrl), backgroundSize: "cover", backgroundPosition: "center" }
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

        {googleEnabled && (
          <>
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={googleLoading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                border: "1px solid var(--ms-border)",
                borderRadius: 8,
                background: "var(--ms-surface, var(--ms-bg2))",
                color: "var(--ms-text)",
                fontSize: 14,
                fontWeight: 500,
                cursor: googleLoading ? "not-allowed" : "pointer",
                opacity: googleLoading ? 0.6 : 1,
                marginBottom: 12,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 12px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--ms-border)" }} />
              <span style={{ fontSize: 12, color: "var(--ms-text3)" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--ms-border)" }} />
            </div>
          </>
        )}

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
            placeholder="Password"
            value={form.password}
            onChange={onChange}
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <div style={{ fontSize: 11, color: "var(--ms-text3)", marginTop: -4 }}>
            Min 12 characters · uppercase · lowercase · number · symbol
          </div>
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
            placeholder="Phone Number (optional)"
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

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--ms-text2)" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
