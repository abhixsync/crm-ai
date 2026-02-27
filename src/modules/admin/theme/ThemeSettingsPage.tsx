"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/core/theme/useTheme";

export function ThemeSettingsPage() {
  const { data: session } = useSession();
  const { theme, setThemeOptimistic, refreshTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState({
    primaryColor: "#2563eb",
    secondaryColor: "#64748b",
    accentColor: "#22c55e",
  });

  const canManage = ["ADMIN", "SUPER_ADMIN"].includes((session as any)?.user?.role || "");

  useEffect(() => {
    setDraft({
      primaryColor: theme.primaryColor || "#2563eb",
      secondaryColor: theme.secondaryColor || "#64748b",
      accentColor: theme.accentColor || "#22c55e",
    });
  }, [theme.accentColor, theme.primaryColor, theme.secondaryColor]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setThemeOptimistic(draft);
    }, 180);

    return () => clearTimeout(timeout);
  }, [draft, setThemeOptimistic]);

  async function saveTheme() {
    if (!canManage) return;

    setSaving(true);
    try {
      const tenantId = (session as any)?.user?.tenantId || null;
      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          ...draft,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to save theme.");
      }

      setThemeOptimistic(data.theme || draft);
      toast.success("Theme saved.");
      await refreshTheme();
    } catch (error: any) {
      toast.error(error?.message || "Unable to save theme.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAsset(assetKey: "logo" | "favicon" | "loginBackground", file: File | null) {
    if (!file || !canManage) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("assetKey", assetKey);
      const tenantId = (session as any)?.user?.tenantId || "";
      if (tenantId) formData.set("tenantId", tenantId);

      const response = await fetch("/api/admin/theme/assets", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to upload asset.");
      }

      setThemeOptimistic(data.theme || {});
      toast.success("Asset uploaded.");
      await refreshTheme();
    } catch (error: any) {
      toast.error(error?.message || "Unable to upload asset.");
    } finally {
      setUploading(false);
    }
  }

  function resetDefaultTheme() {
    setDraft({
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
      accentColor: "#22c55e",
    });
    setThemeOptimistic({
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
      accentColor: "#22c55e",
    });
  }

  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${draft.primaryColor}, ${draft.secondaryColor})`,
      borderColor: draft.accentColor,
    }),
    [draft]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Tenant Theme Settings</CardTitle>
          <CardDescription>Configure brand colors and assets with live preview.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Primary</span>
              <Input type="color" value={draft.primaryColor} onChange={(event) => setDraft((prev) => ({ ...prev, primaryColor: event.target.value }))} disabled={!canManage} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Secondary</span>
              <Input type="color" value={draft.secondaryColor} onChange={(event) => setDraft((prev) => ({ ...prev, secondaryColor: event.target.value }))} disabled={!canManage} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Accent</span>
              <Input type="color" value={draft.accentColor} onChange={(event) => setDraft((prev) => ({ ...prev, accentColor: event.target.value }))} disabled={!canManage} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm text-slate-700">
              <span>Logo</span>
              <Input type="file" accept="image/*" disabled={!canManage || uploading} onChange={(event) => uploadAsset("logo", event.target.files?.[0] || null)} />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Favicon</span>
              <Input type="file" accept="image/*" disabled={!canManage || uploading} onChange={(event) => uploadAsset("favicon", event.target.files?.[0] || null)} />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Login Background</span>
              <Input type="file" accept="image/*" disabled={!canManage || uploading} onChange={(event) => uploadAsset("loginBackground", event.target.files?.[0] || null)} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveTheme} disabled={!canManage || saving}>{saving ? "Saving..." : "Save Theme"}</Button>
            <Button variant="secondary" onClick={resetDefaultTheme} disabled={!canManage}>Reset to Default</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
          <CardDescription>Debounced preview of current theme settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border p-4" style={previewStyle as any}>
            <div className="rounded-lg bg-white/90 p-4 shadow-sm">
              <p className="text-sm font-semibold" style={{ color: draft.primaryColor }}>Primary text preview</p>
              <p className="mt-1 text-sm" style={{ color: draft.secondaryColor }}>Secondary text preview</p>
              <Button className="mt-3" style={{ backgroundColor: draft.accentColor, borderColor: draft.accentColor }}>
                Accent Action
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
