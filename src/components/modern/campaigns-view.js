"use client";

import { AutomationSettingsAdminClient } from "@/components/admin/automation-settings-admin-client";

export function ModernCampaignsView() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-module-frame ms-module-skin ms-campaigns-module">
        <AutomationSettingsAdminClient />
      </div>
    </div>
  );
}
