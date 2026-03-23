"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import "@/components/shells/modern/modern-shell.css";

function VerifyContent() {
  const params = useSearchParams();
  const status = params.get("status");

  const states = {
    success: {
      icon: "✅",
      title: "Email verified!",
      body: "Your email has been verified and your Pro trial is now active.",
      cta: "Go to Login",
    },
    invalid: {
      icon: "❌",
      title: "Invalid or expired link",
      body: "This verification link is invalid or has already been used. Please request a new one.",
      cta: "Back to Login",
    },
    already: {
      icon: "✅",
      title: "Already verified",
      body: "Your email is already verified. You can sign in.",
      cta: "Sign In",
    },
  };

  const state = states[status] ?? {
    icon: "⏳",
    title: "Verifying…",
    body: "Please wait while we verify your email.",
    cta: null,
  };

  return (
    <div className="ms-login">
      <div className="ms-login-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{state.icon}</div>
        <div className="ms-login-title">{state.title}</div>
        <div className="ms-login-subtitle" style={{ marginTop: 8 }}>{state.body}</div>
        {state.cta && (
          <div style={{ marginTop: 24 }}>
            <Link href="/login" className="ms-login-btn" style={{ display: "inline-block", textDecoration: "none" }}>
              {state.cta}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
