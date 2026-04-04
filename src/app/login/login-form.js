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

export default function LoginForm({ theme, tenantId, tenantSlug }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
    setLoading(true);

    const result = await signIn("credentials", {
      email: identifier,
      password,
      tenantId: tenantId || "",
      redirect: false,
    });

    if (result?.error) {
      const msg = result.error === "ACCESS_DENIED_TENANT"
        ? "You don't have access to this workspace."
        : "Invalid username/email or password";
      toast.error(msg);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  // Modern login
  if (theme.uiLayout === "modern") {
    const loginBgStyle = theme.loginBackgroundUrl
      ? { backgroundImage: `url(${theme.loginBackgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
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
          <div className="ms-login-subtitle">Enter your credentials to continue</div>
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
          {!tenantId && (
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted, #706C78)" }}>
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
      style={theme.loginBackgroundUrl ? { backgroundImage: `url(${theme.loginBackgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <CardTitle style={{ color: "var(--accent)" }}>
            Sign in to {process.env.APP_NAME || "Loan CRM"}
          </CardTitle>
          <CardDescription>Use super admin/admin credentials from seed data or your own user.</CardDescription>
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
