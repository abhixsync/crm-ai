import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CRM AI — AI-Powered Loan CRM";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "CRM AI";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #0B0A0F 0%, #16131F 60%, #0B0A0F 100%)",
          position: "relative",
          overflow: "hidden",
          fontFamily: "sans-serif",
        }}
      >
        {/* Glow top-right */}
        <div
          style={{
            position: "absolute",
            right: -80,
            top: -80,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(29,233,168,0.18) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Glow bottom-left */}
        <div
          style={{
            position: "absolute",
            left: -60,
            bottom: -80,
            width: 380,
            height: 380,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "80px 100px",
            flex: 1,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "36px",
              gap: "14px",
            }}
          >
            <div
              style={{
                background: "#1DE9A8",
                borderRadius: "10px",
                width: "44px",
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ color: "#0B0A0F", fontSize: "22px", fontWeight: 900 }}>✦</div>
            </div>
            <div
              style={{
                color: "#1DE9A8",
                fontSize: "18px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                display: "flex",
              }}
            >
              AI-Powered CRM Platform
            </div>
          </div>

          {/* App name */}
          <div
            style={{
              fontSize: "88px",
              fontWeight: 800,
              color: "#FFFFFF",
              lineHeight: 1,
              letterSpacing: "-3px",
              marginBottom: "24px",
              display: "flex",
            }}
          >
            {appName}
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: "26px",
              color: "#A89EC0",
              lineHeight: 1.4,
              maxWidth: "580px",
              marginBottom: "52px",
              display: "flex",
            }}
          >
            Automate customer calls, manage leads, and close more loans with AI.
          </div>

          {/* Feature pills */}
          <div style={{ display: "flex", gap: "14px" }}>
            {["AI Calling", "Multi-Tenant", "Real-Time SSE", "White-Label"].map((tag) => (
              <div
                key={tag}
                style={{
                  background: "rgba(29,233,168,0.08)",
                  border: "1px solid rgba(29,233,168,0.28)",
                  borderRadius: "100px",
                  padding: "8px 22px",
                  color: "#1DE9A8",
                  fontSize: "17px",
                  fontWeight: 500,
                  display: "flex",
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, transparent, #1DE9A8 40%, #8B5CF6 70%, transparent)",
            display: "flex",
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
