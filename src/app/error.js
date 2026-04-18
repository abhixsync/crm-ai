"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("[App Error Boundary]", error);
  }, [error]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      padding: "2rem",
      textAlign: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--ms-text, #1a1a1a)" }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--ms-text2, #666)", marginBottom: "1.5rem", maxWidth: "400px" }}>
        An unexpected error occurred. You can try to recover or refresh the page.
      </p>
      <button
        onClick={reset}
        style={{
          padding: "0.5rem 1.25rem",
          borderRadius: "6px",
          border: "none",
          background: "var(--ms-accent, #1DE9A8)",
          color: "#000",
          fontWeight: 600,
          cursor: "pointer",
          fontSize: "0.9rem",
        }}
      >
        Try again
      </button>
    </div>
  );
}
