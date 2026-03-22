"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loader";

export function AccountSettingsPage() {
  const { data: session } = useSession();
  const [tenantDisplayName, setTenantDisplayName] = useState("");
  const [crmName, setCrmName] = useState("");
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const canManage = ["ADMIN", "SUPER_ADMIN"].includes((session as any)?.user?.role || "");
  const isSuperAdmin = (session as any)?.user?.role === "SUPER_ADMIN";

  const fetchTenants = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/tenants");
      const data = await response.json();
      if (response.ok) {
        setTenants(data.tenants || []);
      }
    } catch (error) {
      console.error("Failed to fetch tenants:", error);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!selectedTenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const url = isSuperAdmin ? `/api/admin/settings?tenantId=${selectedTenantId}` : "/api/admin/settings";
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) {
        setTenantDisplayName(data.tenantDisplayName || data.tenantName || "");
        setCrmName(data.crmName || "");
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, selectedTenantId]);

  useEffect(() => {
    // Set default tenant for both admin and super admin
    const defaultTenantId = (session as any)?.user?.tenantId || "";
    setSelectedTenantId(defaultTenantId);

    if (isSuperAdmin) {
      void fetchTenants();
    }
  }, [isSuperAdmin, session, fetchTenants]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  async function saveSettings() {
    if (!canManage || !selectedTenantId) return;

    const normalizedTenantDisplayName = String(tenantDisplayName || "").trim();
    if (!normalizedTenantDisplayName) {
      toast.error("Tenant display name is required.");
      return;
    }

    setSaving(true);
    try {
      const url = isSuperAdmin ? `/api/admin/settings?tenantId=${selectedTenantId}` : "/api/admin/settings";
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantDisplayName: normalizedTenantDisplayName,
          crmName: crmName.trim() || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to save settings.");
      }

      if (isSuperAdmin) {
        void fetchTenants();
      }

      toast.success("Settings saved.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader label="Loading account settings..." />;
  }

  return (
    <Card className="account-settings-card">
      <CardHeader>
        <CardTitle>Organization Settings</CardTitle>
        <CardDescription>Configure tenant display names and CRM label overrides.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 account-settings-content">
        {isSuperAdmin && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Select Tenant
            </label>
            <Select
              className=""
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
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

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Tenant Display Name
          </label>
          <Input
            value={tenantDisplayName}
            onChange={(e) => setTenantDisplayName(e.target.value)}
            placeholder="Enter tenant display name"
            disabled={!canManage || !selectedTenantId}
          />
          <p className="text-xs text-slate-500">
            This is the organization name shown across tenant-facing pages and defaults.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            CRM Name
          </label>
          <Input
            value={crmName}
            onChange={(e) => setCrmName(e.target.value)}
            placeholder="Enter custom CRM name (leave empty to use tenant name)"
            disabled={!canManage || !selectedTenantId}
          />
          <p className="text-xs text-slate-500">
            This name will be displayed in the dashboard header. If left empty, the tenant name will be used.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={saveSettings}
            disabled={!canManage || !selectedTenantId}
            loading={saving}
            loadingText="Saving settings..."
            className="w-full sm:w-auto"
          >
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
