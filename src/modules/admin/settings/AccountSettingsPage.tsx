"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function AccountSettingsPage() {
  const { data: session } = useSession();
  const [crmName, setCrmName] = useState("");
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const canManage = ["ADMIN", "SUPER_ADMIN"].includes((session as any)?.user?.role || "");
  const isSuperAdmin = (session as any)?.user?.role === "SUPER_ADMIN";

  useEffect(() => {
    // Set default tenant for both admin and super admin
    const defaultTenantId = (session as any)?.user?.tenantId || "";
    setSelectedTenantId(defaultTenantId);
    
    if (isSuperAdmin) {
      fetchTenants();
    } else {
      fetchSettings();
    }
  }, [isSuperAdmin, session]);

  useEffect(() => {
    if (selectedTenantId) {
      fetchSettings();
    }
  }, [selectedTenantId]);

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

  async function fetchSettings() {
    if (!selectedTenantId) return;
    
    try {
      const url = isSuperAdmin ? `/api/admin/settings?tenantId=${selectedTenantId}` : "/api/admin/settings";
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) {
        setCrmName(data.crmName || "");
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!canManage || !selectedTenantId) return;

    setSaving(true);
    try {
      const url = isSuperAdmin ? `/api/admin/settings?tenantId=${selectedTenantId}` : "/api/admin/settings";
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmName: crmName.trim() || null }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to save settings.");
      }

      toast.success("Settings saved.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Configure your CRM display name and other account preferences.</CardDescription>
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
            CRM Name Override
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

        <div className="flex gap-2">
          <Button onClick={saveSettings} disabled={!canManage || saving || !selectedTenantId}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}