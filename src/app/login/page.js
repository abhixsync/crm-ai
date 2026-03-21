"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import "@/components/shells/modern/modern-shell.css";

export default function LoginPage() {
  const router = useRouter();
  const [theme, setTheme] = useState({ loginBackgroundUrl: null, themeName: null, displayName: null, primaryColor: null, secondaryColor: null, accentColor: null, uiLayout: null });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPublicTheme = async () => {
      try {
        const response = await fetch("/api/theme/public", { cache: "no-store" });
        const data = await response.json();
        if (data.theme) {
          setTheme(data.theme);
        }
      } catch (error) {
        console.error("Failed to fetch public theme:", error);
      }
    };

    fetchPublicTheme();
  }, []);

  // Apply modern theme to <html> for CSS variables
  useEffect(() => {
    if (theme.uiLayout === "modern") {
      const saved = localStorage.getItem("ms-ui-theme") || "dark";
      document.documentElement.setAttribute("data-ui-theme", saved);
    }
  }, [theme.uiLayout]);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);

    const result = await signIn("credentials", {
      email: identifier,
      password,
      redirect: false,
    });

    if (result?.error) {
      toast.error("Invalid username/email or password");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  // Modern login
  if (theme.uiLayout === "modern") {
    return (
      <div className="ms-login">
        <div className="ms-login-card">
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