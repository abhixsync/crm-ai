"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/core/theme/useTheme";
import { Select } from "@/components/ui/select";

export function ThemeSettingsPage() {
  const { data: session } = useSession();
  const { theme, setThemeOptimistic, refreshTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [draft, setDraft] = useState({
    primaryColor: "#2563eb",
    secondaryColor: "#64748b",
    accentColor: "#22c55e",
  });

  const canManage = ["ADMIN", "SUPER_ADMIN"].includes((session as any)?.user?.role || "");
  const isSuperAdmin = (session as any)?.user?.role === "SUPER_ADMIN";

  useEffect(() => {
    // Set default tenant for both admin and super admin
    const defaultTenantId = (session as any)?.user?.tenantId || "";
    setSelectedTenantId(defaultTenantId);
    
    if (isSuperAdmin) {
      fetchTenants();
    }
  }, [isSuperAdmin, session]);

  useEffect(() => {
    if (selectedTenantId) {
      // Load theme for selected tenant
      const loadTheme = async () => {
        try {
          const query = selectedTenantId ? `?tenantId=${encodeURIComponent(selectedTenantId)}` : "";
          const response = await fetch(`/api/theme/active${query}`);
          const payload = await response.json();
          const loadedTheme = payload?.theme || {
            primaryColor: "#2563eb",
            secondaryColor: "#64748b", 
            accentColor: "#22c55e"
          };
          setDraft({
            primaryColor: loadedTheme.primaryColor || "#2563eb",
            secondaryColor: loadedTheme.secondaryColor || "#64748b",
            accentColor: loadedTheme.accentColor || "#22c55e",
          });
          setThemeOptimistic(loadedTheme);
        } catch (error) {
          console.error("Failed to load theme:", error);
        }
      };
      loadTheme();
    }
  }, [selectedTenantId, setThemeOptimistic]);

  async function fetchTenants() {
    try {
      const response = await fetch("/api/admin/tenants");
      const data = await response.json();
      if (response.ok) {
        setTenants(data.tenants || []);
        // selectedTenantId is already set to super admin's tenant
      }
    } catch (error) {
      console.error("Failed to fetch tenants:", error);
    }
  }

  useEffect(() => {
    setThemeOptimistic(draft);
  }, [draft, setThemeOptimistic]);

  async function saveTheme() {
    if (!canManage || !selectedTenantId) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
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
    if (!file || !canManage || !selectedTenantId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("assetKey", assetKey);
      formData.set("tenantId", selectedTenantId);

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

  async function clearAsset(assetKey: "logo" | "favicon" | "loginBackground") {
    if (!canManage || !selectedTenantId) return;

    setSaving(true);
    try {
      const patch: any = {};
      if (assetKey === "logo") patch.logoUrl = null;
      if (assetKey === "favicon") patch.faviconUrl = null;
      if (assetKey === "loginBackground") patch.loginBackgroundUrl = null;

      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          ...patch,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to clear asset.");
      }

      setThemeOptimistic(data.theme || {});
      toast.success("Asset cleared.");
      await refreshTheme();
    } catch (error: any) {
      toast.error(error?.message || "Unable to clear asset.");
    } finally {
      setSaving(false);
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
          {isSuperAdmin && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Select Tenant
              </label>
              <Select
                className=""
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                disabled={!canManage}
              >
                <option value="">Select a tenant...</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

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
              {theme.logoUrl && (
                <div className="mb-2 flex items-center gap-2">
                  <img src={theme.logoUrl} alt="Current logo" className="h-8 w-auto border rounded" />
                  <Button 
                    variant="secondary" 
                    onClick={() => clearAsset("logo")}
                    disabled={!canManage || saving}
                  >
                    Clear
                  </Button>
                </div>
              )}
              <Input type="file" accept="image/*" disabled={!canManage || uploading} onChange={(event) => uploadAsset("logo", event.target.files?.[0] || null)} />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Favicon</span>
              {theme.faviconUrl && (
                <div className="mb-2 flex items-center gap-2">
                  <img src={theme.faviconUrl} alt="Current favicon" className="h-6 w-6 border rounded" />
                  <Button 
                    variant="secondary" 
                    onClick={() => clearAsset("favicon")}
                    disabled={!canManage || saving}
                  >
                    Clear
                  </Button>
                </div>
              )}
              <Input type="file" accept="image/*" disabled={!canManage || uploading} onChange={(event) => uploadAsset("favicon", event.target.files?.[0] || null)} />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Login Background</span>
              {theme.loginBackgroundUrl && (
                <div className="mb-2 flex items-center gap-2">
                  <img src={theme.loginBackgroundUrl} alt="Current login background" className="h-12 w-20 border rounded object-cover" />
                  <Button 
                    variant="secondary" 
                    onClick={() => clearAsset("loginBackground")}
                    disabled={!canManage || saving}
                  >
                    Clear
                  </Button>
                </div>
              )}
              <Input type="file" accept="image/*" disabled={!canManage || uploading} onChange={(event) => uploadAsset("loginBackground", event.target.files?.[0] || null)} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveTheme} disabled={!canManage || saving || !selectedTenantId}>{saving ? "Saving..." : "Save Theme"}</Button>
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
              <Button 
                className="mt-3" 
                style={{ backgroundColor: draft.accentColor, borderColor: draft.accentColor }}
                onClick={() => toast.success("Accent button clicked! Theme is working.")}
              >
                Accent Action
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
