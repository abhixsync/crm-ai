"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ThemeEditor } from "./theme-editor";

export function ModernGlobalThemeView({ user, initialLayout }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <UiLayoutPicker initialLayout={initialLayout} />
      <ThemeEditor mode="global" />
    </div>
  );
}

function UiLayoutPicker({ initialLayout }) {
  const [currentLayout, setCurrentLayout] = useState(initialLayout || "modern");
  const [saving, setSaving] = useState(false);

  const switchLayout = useCallback(async (layout) => {
    if (layout === currentLayout) return;
    setCurrentLayout(layout);
    setSaving(true);
    const toastId = toast.loading(`Applying ${layout} layout…`);
    try {
      const res = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiLayout: layout, isBaseTheme: true }),
      });
      if (res.ok) {
        toast.success(`${layout === "modern" ? "Modern" : "Classic"} layout applied!`, { id: toastId });
        setTimeout(() => window.location.reload(), 600);
      } else {
        setCurrentLayout(currentLayout);
        toast.error("Failed to update UI layout", { id: toastId });
        setSaving(false);
      }
    } catch {
      setCurrentLayout(currentLayout);
      toast.error("Failed to update UI layout", { id: toastId });
      setSaving(false);
    }
  }, [currentLayout]);

  const layouts = [
    { key: "modern", label: "Modern", desc: "Sidebar + topbar shell with dark/light theme toggle" },
    { key: "classic", label: "Classic", desc: "Original hamburger menu layout with shadcn components" },
  ];

  return (
    <div className="ms-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 6 }}>UI Layout</div>
      <p style={{ fontSize: 12, color: "var(--ms-text3)", marginBottom: 16 }}>
        Choose the platform-wide UI layout. The page will reload to apply.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        {layouts.map(({ key, label, desc }) => (
          <div
            key={key}
            onClick={() => !saving && switchLayout(key)}
            style={{
              flex: 1, padding: "14px 16px", borderRadius: 8,
              border: `1px solid ${currentLayout === key ? "var(--ms-accent)" : "var(--ms-border2)"}`,
              background: currentLayout === key ? "var(--ms-accent-dim)" : "transparent",
              cursor: saving ? "wait" : "pointer", transition: "all .15s",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: currentLayout === key ? "var(--ms-accent-txt)" : "var(--ms-text)" }}>
              {label}
              {currentLayout === key && (
                <span className="ms-bdg" style={{ marginLeft: 8, background: "var(--ms-accent-dim)", color: "var(--ms-accent-txt)" }}>Active</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--ms-text3)", marginTop: 4 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
