"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [theme, setTheme] = useState({ loginBackgroundUrl: null });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch public theme data for login background
    const fetchPublicTheme = async () => {
      try {
        const response = await fetch("/api/theme/public");
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

  return (
    <main 
      className="flex min-h-screen items-center justify-center p-4 sm:p-6"
      style={theme.loginBackgroundUrl ? { backgroundImage: `url(${theme.loginBackgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <CardTitle>Sign in to Loan CRM</CardTitle>
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