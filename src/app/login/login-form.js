"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function LoginForm({ theme, tenantId, tenantSlug }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", "light");
  }, []);

  useEffect(() => {
    const verified = searchParams.get("verified");
    if (verified === "success") toast.success("Email verified! You can now sign in.");
    else if (verified === "invalid") toast.error("Verification link is invalid or expired.");
    else if (verified === "already") toast.info("Email already verified — please sign in.");

    const welcome = searchParams.get("welcome");
    if (welcome === "1") {
      toast.success(`Workspace ready! Bookmark this URL: ${window.location.origin}`);
    }
  }, [searchParams]);

  async function onSubmit(event) {
    event.preventDefault();
    const id = identifier.trim();
    const pw = password.trim();
    if (!id) { toast.error("Please enter your username or email."); return; }
    if (!pw) { toast.error("Please enter your password."); return; }
    if (id.length < 3) { toast.error("Username or email is too short."); return; }
    if (pw.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    setLoading(true);

    const result = await signIn("credentials", {
      email: id,
      password: pw,
      tenantId: tenantId || "",
      redirect: false,
    });

    if (result?.error) {
      const msg = result.error === "AccessDenied" || result.error === "ACCESS_DENIED_TENANT"
        ? "You don't have access to this workspace."
        : result.error === "SUSPENDED"
        ? "Your account has been suspended. Please contact your administrator."
        : "Invalid credentials. Please try again.";
      toast.error(msg);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      // If on a tenant subdomain, set pre-auth cookie so signIn callback knows the tenant
      if (tenantSlug) {
        await fetch("/api/auth/pre-google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantSlug }),
        });
      }
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      toast.error("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  }

  // Modern login
  if (theme.uiLayout === "modern") {
    const loginBgStyle = theme.loginBackgroundUrl
      ? { backgroundImage: safeBgUrl(theme.loginBackgroundUrl), backgroundSize: "cover", backgroundPosition: "center" }
      : undefined;

    return (
      <div className="ms-login" style={loginBgStyle}>
        <div className="ms-login-card">
          {theme.logoUrl && (
            <div className="ms-login-logo">
              <img src={theme.logoUrl} alt="Logo" />
            </div>
          )}
          <div className="ms-login-title">
            Sign in to {process.env.NEXT_PUBLIC_APP_NAME || "CRM AI"}
          </div>
          <div className="ms-login-subtitle">{process.env.NEXT_PUBLIC_APP_TAGLINE || "Enter your credentials to continue"}</div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
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
          <form className="ms-login-form" onSubmit={onSubmit}>
            <input
              className="ms-login-input"
              type="text"
              placeholder="Username or Email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <input
              className="ms-login-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="ms-login-btn" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <div style={{ textAlign: "right", marginTop: 8, fontSize: 12 }}>
            <Link href="/forgot-password" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
              Forgot password?
            </Link>
          </div>
          {!tenantId && (
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--ms-text2)" }}>
              Don&apos;t have an account?{" "}
              <Link href="/register" style={{ color: "var(--ms-accent)", textDecoration: "none" }}>
                Start free trial
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Classic login
  return (
    <main
      className="flex min-h-screen items-center justify-center p-4 sm:p-6"
      style={theme.loginBackgroundUrl ? { backgroundImage: safeBgUrl(theme.loginBackgroundUrl), backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <CardTitle style={{ color: "var(--accent)" }}>
            Sign in to {process.env.NEXT_PUBLIC_APP_NAME || "CRM AI"}
          </CardTitle>
          <CardDescription>Enter your credentials to sign in.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              type="text"
              placeholder="Username or Email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
