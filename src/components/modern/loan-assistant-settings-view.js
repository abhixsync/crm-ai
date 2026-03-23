"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useTenantSwitcher } from "@/components/providers/tenant-switcher-provider";

const LANG_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
];

export function ModernLoanAssistantSettingsView({ user }) {
  const { data: session, status } = useSession();
  const { selectedTenantId, isSuperAdmin } = useTenantSwitcher();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Use session tenantId, or for super admin use the switcher selection
      let tid = session?.user?.tenantId || user?.tenantId || null;
      if (!tid && isSuperAdmin) tid = selectedTenantId;
      if (!tid) { setError("Please select a tenant from the topbar switcher."); setLoading(false); return; }
      setTenantId(tid);
      const res = await fetch("/api/tenant/loan-assistant-settings", { headers: { "X-Tenant-ID": tid } });
      const json = await res.json();
      if (json.success && json.data) setData(json.data);
      else setError(json.error || "Failed to load settings");
    } catch (e) { setError(e.message || "Failed to load loan settings"); }
    finally { setLoading(false); }
  }, [session, user, isSuperAdmin, selectedTenantId]);

  // Wait for session to finish loading before fetching
  useEffect(() => {
    if (status === "loading") return;
    loadSettings();
  }, [status, loadSettings]);

  const saveField = async (field, value) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/loan-assistant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Tenant-ID": tenantId },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        toast.success("Setting saved");
      } else toast.error(json.error || "Failed to save");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  if (loading || status === "loading") return <div className="ms-empty">Loading loan assistant settings...</div>;
  if (error) return <div className="ms-empty" style={{ color: "var(--ms-red, #f25858)" }}>{error}</div>;
  if (!data) return <div className="ms-empty">Unable to load loan assistant settings.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Loan Assistant Configuration</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <InlineField label="Company Name" field="loanAssistantCompanyName" value={data.loanAssistantCompanyName} onSave={saveField} disabled={saving} />
          <InlineField label="AI Agent Name" field="aiAgentName" value={data.aiAgentName} onSave={saveField} disabled={saving} />
          <InlineField label="Human Advisor Name" field="loanAssistantHumanAdvisorName" value={data.loanAssistantHumanAdvisorName} onSave={saveField} disabled={saving} />
          <InlineField label="Callback Phone" field="loanAssistantCallbackPhone" value={data.loanAssistantCallbackPhone} onSave={saveField} disabled={saving} />
          <InlineField label="Notification Email" field="loanAssistantNotificationEmail" value={data.loanAssistantNotificationEmail} onSave={saveField} disabled={saving} />
        </div>
      </div>

      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Conversation Language</div>
        <LangField value={data.loanAssistantLanguage} onSave={(v) => saveField("loanAssistantLanguage", v)} disabled={saving} />
      </div>
    </div>
  );
}

function InlineField({ label, field, value, onSave, disabled }) {
  const [val, setVal] = useState(value || "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setVal(value || ""); setDirty(false); }, [value]);

  return (
    <div className="ms-field">
      <div className="ms-field-lbl">{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="ms-field-inp"
          value={val}
          onChange={(e) => { setVal(e.target.value); setDirty(true); }}
        />
        {dirty && (
          <button
            className="ms-btn ms-btn-pri"
            style={{ flexShrink: 0, padding: "6px 12px" }}
            onClick={() => { onSave(field, val); setDirty(false); }}
            disabled={disabled}
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
}

function LangField({ value, onSave, disabled }) {
  const [val, setVal] = useState(value || "hinglish");
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setVal(value || "hinglish"); setDirty(false); }, [value]);

  return (
    <div className="ms-field">
      <div className="ms-field-lbl">Language</div>
      <div style={{ display: "flex", gap: 6 }}>
        <select
          className="ms-field-inp"
          value={val}
          onChange={(e) => { setVal(e.target.value); setDirty(true); }}
        >
          {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {dirty && (
          <button className="ms-btn ms-btn-pri" style={{ flexShrink: 0, padding: "6px 12px" }}
            onClick={() => { onSave(val); setDirty(false); }} disabled={disabled}>
            Save
          </button>
        )}
      </div>
    </div>
  );
}
