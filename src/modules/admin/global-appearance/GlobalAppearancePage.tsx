"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SYSTEM_THEME_DEFAULT, EditableTheme } from "@/core/theme/system-defaults";

export function GlobalAppearancePage() {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [baseTheme, setBaseTheme] = useState<EditableTheme>({ ...SYSTEM_THEME_DEFAULT });
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = (session as any)?.user?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (isSuperAdmin) {
      loadBaseTheme();
    }
  }, [isSuperAdmin]);

  async function loadBaseTheme() {
    try {
      const response = await fetch("/api/theme/active");
      const payload = await response.json();
      if (payload?.theme) {
        setBaseTheme(payload.theme);
      }
    } catch (error) {
      console.error("Failed to load base theme:", error);
      toast.error("Failed to load base theme");
    } finally {
      setLoading(false);
    }
  }

  async function saveBaseTheme(updates: Partial<EditableTheme>) {
    if (!isSuperAdmin) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updates,
          isBaseTheme: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to save base theme.");
      }

      setBaseTheme(data.theme);
      toast.success("Base theme updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to save base theme");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAsset(assetKey: string, file: File) {
    if (!isSuperAdmin) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("assetKey", assetKey);
      formData.append("isBaseTheme", "true");

      const response = await fetch("/api/admin/theme/assets", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to upload asset.");
      }

      setBaseTheme(data.theme);
      toast.success(`${assetKey} uploaded successfully`);
    } catch (error: any) {
      toast.error(error.message || "Failed to upload asset");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8">Loading base theme...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Platform Base Theme</CardTitle>
          <CardDescription>
            These settings define the default appearance for all tenants. Individual tenants can override these settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Colors */}
            <div>
              <h3 className="text-lg font-medium mb-4">Colors</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Primary Color</label>
                  <Input
                    type="color"
                    value={baseTheme.primaryColor}
                    onChange={(e) => setBaseTheme(prev => ({ ...prev, primaryColor: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Secondary Color</label>
                  <Input
                    type="color"
                    value={baseTheme.secondaryColor}
                    onChange={(e) => setBaseTheme(prev => ({ ...prev, secondaryColor: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Accent Color</label>
                  <Input
                    type="color"
                    value={baseTheme.accentColor}
                    onChange={(e) => setBaseTheme(prev => ({ ...prev, accentColor: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Background Color</label>
                  <Input
                    type="color"
                    value={baseTheme.backgroundColor}
                    onChange={(e) => setBaseTheme(prev => ({ ...prev, backgroundColor: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                onClick={() => saveBaseTheme({
                  primaryColor: baseTheme.primaryColor,
                  secondaryColor: baseTheme.secondaryColor,
                  accentColor: baseTheme.accentColor,
                  backgroundColor: baseTheme.backgroundColor,
                })}
                disabled={saving}
                className="mt-4"
              >
                {saving ? "Saving..." : "Save Colors"}
              </Button>
            </div>

            {/* Typography */}
            <div>
              <h3 className="text-lg font-medium mb-4">Typography</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Font Family</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={baseTheme.fontFamily}
                    onChange={(e) => setBaseTheme(prev => ({ ...prev, fontFamily: e.target.value }))}
                  >
                    <option value="Inter, system-ui, sans-serif">Inter</option>
                    <option value="Roboto, system-ui, sans-serif">Roboto</option>
                    <option value="Open Sans, system-ui, sans-serif">Open Sans</option>
                    <option value="Lato, system-ui, sans-serif">Lato</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Font Scale</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={baseTheme.fontScale}
                    onChange={(e) => setBaseTheme(prev => ({ ...prev, fontScale: e.target.value }))}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={() => saveBaseTheme({
                  fontFamily: baseTheme.fontFamily,
                  fontScale: baseTheme.fontScale,
                })}
                disabled={saving}
                className="mt-4"
              >
                {saving ? "Saving..." : "Save Typography"}
              </Button>
            </div>

            {/* Assets */}
            <div>
              <h3 className="text-lg font-medium mb-4">Assets</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Logo</label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAsset("logo", file);
                    }}
                    disabled={uploading}
                  />
                  {baseTheme.logoUrl && (
                    <img src={baseTheme.logoUrl} alt="Logo" className="mt-2 h-8" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Favicon</label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAsset("favicon", file);
                    }}
                    disabled={uploading}
                  />
                  {baseTheme.faviconUrl && (
                    <img src={baseTheme.faviconUrl} alt="Favicon" className="mt-2 h-6 w-6" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}