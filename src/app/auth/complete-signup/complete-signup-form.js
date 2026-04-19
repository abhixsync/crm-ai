"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import "@/components/shells/modern/modern-shell.css";

export default function CompleteSignupForm({ user }) {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const co = company.trim();
    if (co.length < 2) { toast.error("Company name must be at least 2 characters."); return; }
    if (co.length > 100) { toast.error("Company name is too long."); return; }
    setLoading(true);

    try {
      const res = await fetch("/api/auth/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: co, phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to complete sign-up.");
        setLoading(false);
        return;
      }
      // Redirect to new tenant subdomain
      if (data.slug) {
        const { protocol, host } = window.location;
        const parts = host.split(".");
        const rootDomain = parts.length > 2 ? parts.slice(-2).join(".") : host;
        window.location.href = `${protocol}//${data.slug}.${rootDomain}/login?welcome=1`;
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="ms-login">
      <div className="ms-login-card" style={{ maxWidth: 420 }}>
        <div className="ms-login-title">Complete your account</div>
        <div className="ms-login-subtitle" style={{ marginBottom: 20 }}>
          Signed in as <strong>{user?.email}</strong>. Enter your company name to create your workspace.
        </div>
        <form className="ms-login-form" onSubmit={onSubmit}>
          <input
            className="ms-login-input"
            type="text"
            placeholder="Company Name"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            autoFocus
          />
          <input
            className="ms-login-input"
            type="tel"
            placeholder="Phone Number (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button className="ms-login-btn" type="submit" disabled={loading}>
            {loading ? "Creating workspace…" : "Create Workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
