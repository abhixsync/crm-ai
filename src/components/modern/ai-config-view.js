"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

const PROVIDER_TYPE_STYLE = {
  OPENAI: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
  CLAUDE: { bg: "rgba(167,139,250,.15)", color: "var(--ms-purple, #a78bfa)" },
  GROQ: { bg: "rgba(245,166,35,.15)", color: "var(--ms-amber, #f5a623)" },
  DIALOGFLOW: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
  GENERIC_HTTP: { bg: "rgba(138,138,136,.14)", color: "var(--ms-text2, #8a8a88)" },
  TWILIO: { bg: "var(--ms-accent-dim)", color: "var(--ms-accent-txt)" },
  PLIVO: { bg: "rgba(242,88,88,.12)", color: "var(--ms-red, #f25858)" },
  VONAGE: { bg: "rgba(79,156,249,.15)", color: "var(--ms-blue, #4f9cf9)" },
};

function orderProviders(providers) {
  return [...providers].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    if ((left.priority ?? 100) !== (right.priority ?? 100)) return (left.priority ?? 100) - (right.priority ?? 100);
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function getPromptTitle(scope) {
  if (scope?.isSuperAdmin) return "System Prompt - Global";
  return "System Prompt";
}

export function ModernAiConfigView({
  initialPrompt,
  initialScope,
  initialAiProviders,
  initialTelephonyProviders,
}) {
  const isSuperAdmin = Boolean(initialScope?.isSuperAdmin);
  const [aiProviders, setAiProviders] = useState(() => orderProviders(initialAiProviders || []));
  const [telephonyProviders, setTelephonyProviders] = useState(() => orderProviders(initialTelephonyProviders || []));
  const [promptText, setPromptText] = useState(initialPrompt?.prompt || "");
  const [promptLabel, setPromptLabel] = useState(initialPrompt?.label || "Default System Prompt");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [deletingProviderId, setDeletingProviderId] = useState("");
  const [editor, setEditor] = useState(null);

  const orderedAiProviders = useMemo(() => orderProviders(aiProviders), [aiProviders]);
  const orderedTelephonyProviders = useMemo(() => orderProviders(telephonyProviders), [telephonyProviders]);

  const fetchProviders = useCallback(async () => {
    if (!isSuperAdmin) return;

    try {
      const [aiRes, telephonyRes] = await Promise.all([
        fetch("/api/admin/ai-providers"),
        fetch("/api/admin/telephony-providers"),
      ]);

      if (aiRes.ok) {
        const aiPayload = await aiRes.json();
        setAiProviders(orderProviders(aiPayload.providers || []));
      }

      if (telephonyRes.ok) {
        const telephonyPayload = await telephonyRes.json();
        setTelephonyProviders(orderProviders(telephonyPayload.providers || []));
      }
    } catch {
      toast.error("Unable to refresh provider data.");
    }
  }, [isSuperAdmin]);

  const savePrompt = useCallback(async () => {
    setSavingPrompt(true);
    try {
      const res = await fetch("/api/admin/ai-system-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: promptLabel,
          prompt: promptText,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPromptText(data?.prompt?.prompt || promptText);
        setPromptLabel(data?.prompt?.label || promptLabel);
        toast.success("System prompt saved.");
      } else {
        toast.error(data?.error || "Failed to save prompt.");
      }
    } catch {
      toast.error("Failed to save prompt.");
    } finally {
      setSavingPrompt(false);
    }
  }, [promptLabel, promptText]);

  const resetPrompt = useCallback(async () => {
    setSavingPrompt(true);
    try {
      const res = await fetch("/api/admin/ai-system-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (res.ok) {
        setPromptText(data?.prompt?.prompt || "");
        setPromptLabel(data?.prompt?.label || "Default System Prompt");
        toast.success("System prompt reset.");
      } else {
        toast.error(data?.error || "Failed to reset prompt.");
      }
    } catch {
      toast.error("Failed to reset prompt.");
    } finally {
      setSavingPrompt(false);
    }
  }, []);

  function openEditor(kind, provider) {
    setEditor({
      kind,
      id: provider.id,
      name: provider.name || "",
      type: provider.type || "",
      endpoint: provider.endpoint || "",
      apiKey: provider.apiKey || "",
      model: provider.model || "",
      priority: Number(provider.priority ?? 100),
      timeoutMs: Number(provider.timeoutMs ?? 12000),
      enabled: Boolean(provider.enabled),
      isActive: Boolean(provider.isActive),
    });
  }

  function closeEditor() {
    if (savingProvider) return;
    setEditor(null);
  }

  async function saveProvider() {
    if (!editor?.id) return;

    setSavingProvider(true);
    try {
      const isAiProvider = editor.kind === "ai";
      const endpoint = isAiProvider
        ? `/api/admin/ai-providers/${editor.id}`
        : `/api/admin/telephony-providers/${editor.id}`;
      const payload = isAiProvider
        ? {
            name: editor.name,
            endpoint: editor.endpoint,
            apiKey: editor.apiKey,
            model: editor.model,
            priority: Number(editor.priority),
            timeoutMs: Number(editor.timeoutMs),
            enabled: Boolean(editor.enabled),
            isActive: Boolean(editor.isActive),
          }
        : {
            name: editor.name,
            apiKey: editor.apiKey,
            priority: Number(editor.priority),
            timeoutMs: Number(editor.timeoutMs),
            enabled: Boolean(editor.enabled),
            isActive: Boolean(editor.isActive),
          };

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to update provider.");
      }

      toast.success(`${editor.kind === "ai" ? "AI" : "Telephony"} provider updated.`);
      closeEditor();
      await fetchProviders();
    } catch (error) {
      toast.error(error?.message || "Unable to update provider.");
    } finally {
      setSavingProvider(false);
    }
  }

  async function deleteProvider(kind, providerId) {
    const label = kind === "ai" ? "AI provider" : "telephony provider";
    const confirmed = window.confirm(`Delete this ${label}?`);
    if (!confirmed) return;

    setDeletingProviderId(providerId);
    try {
      const endpoint = kind === "ai"
        ? `/api/admin/ai-providers/${providerId}`
        : `/api/admin/telephony-providers/${providerId}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Unable to delete ${label}.`);
      }

      toast.success(`${label} deleted.`);
      await fetchProviders();
    } catch (error) {
      toast.error(error?.message || `Unable to delete ${label}.`);
    } finally {
      setDeletingProviderId("");
    }
  }

  return (
    <div className="ms-ai-config-view" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {isSuperAdmin && (
        <>
          <ProviderTable
            title="AI Providers"
            providers={orderedAiProviders}
            typeKey="ai"
            onEdit={openEditor}
            onDelete={deleteProvider}
            deletingProviderId={deletingProviderId}
          />

          <ProviderTable
            title="Telephony Providers"
            providers={orderedTelephonyProviders}
            typeKey="telephony"
            onEdit={openEditor}
            onDelete={deleteProvider}
            deletingProviderId={deletingProviderId}
          />
        </>
      )}

      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 4 }}>
              {getPromptTitle(initialScope)}
            </div>
            <p style={{ fontSize: 12, color: "var(--ms-text2)", lineHeight: 1.6 }}>
              Edit the live prompt used for AI conversations in this scope.
            </p>
          </div>

          <div className="ms-field">
            <div className="ms-field-lbl">Prompt label</div>
            <input
              className="ms-field-inp"
              value={promptLabel}
              onChange={(event) => setPromptLabel(event.target.value)}
              placeholder="Default System Prompt"
            />
          </div>

          <div className="ms-field" style={{ marginBottom: 0 }}>
            <div className="ms-field-lbl">Prompt text</div>
            <textarea
              className="ms-field-inp ms-field-area"
              rows={10}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder="Write the system prompt here..."
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ms-btn ms-btn-pri" onClick={savePrompt} disabled={savingPrompt}>
              {savingPrompt ? "Saving..." : "Save Prompt"}
            </button>
            <button className="ms-btn" onClick={resetPrompt} disabled={savingPrompt}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {editor && (
        <ProviderEditorModal
          editor={editor}
          onChange={setEditor}
          onClose={closeEditor}
          onSave={saveProvider}
          saving={savingProvider}
        />
      )}
    </div>
  );
}

function ProviderTable({ title, providers, typeKey, onEdit, onDelete, deletingProviderId }) {
  return (
    <div className="ms-card">
      <div className="ms-card-hd">
        <span className="ms-card-title">{title}</span>
      </div>
      <div className="ms-tbl-wrap">
        <table className="ms-tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>{typeKey === "ai" ? "Model" : "Priority"}</th>
              <th>{typeKey === "ai" ? "Priority" : "Timeout"}</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ms-text3)" }}>
                  No providers configured.
                </td>
              </tr>
            )}
            {providers.map((provider) => {
              const typeStyle = PROVIDER_TYPE_STYLE[provider.type] || { bg: "var(--ms-bg3)", color: "var(--ms-text2)" };
              const isDeleting = deletingProviderId === provider.id;
              return (
                <tr key={provider.id}>
                  <td style={{ fontWeight: 500 }}>
                    {provider.name || provider.type}
                    {provider.isActive ? (
                      <div style={{ fontSize: 10, color: "var(--ms-accent)", marginTop: 3 }}>Active provider</div>
                    ) : null}
                  </td>
                  <td>
                    <span className="ms-bdg" style={{ background: typeStyle.bg, color: typeStyle.color }}>
                      {provider.type}
                    </span>
                  </td>
                  <td className="ms-mono">
                    {typeKey === "ai" ? provider.model || "-" : provider.priority ?? "-"}
                  </td>
                  <td className="ms-mono">
                    {typeKey === "ai" ? provider.priority ?? "-" : `${provider.timeoutMs ?? 12000} ms`}
                  </td>
                  <td>
                    <span
                      className="ms-bdg"
                      style={{
                        background: provider.enabled ? "var(--ms-accent-dim)" : "var(--ms-bg3)",
                        color: provider.enabled ? "var(--ms-accent-txt)" : "var(--ms-text3)",
                      }}
                    >
                      {provider.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="ms-btn" onClick={() => onEdit(typeKey, provider)}>
                        Edit
                      </button>
                      <button
                        className="ms-btn"
                        style={{ color: "var(--ms-red)" }}
                        onClick={() => onDelete(typeKey, provider.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProviderEditorModal({ editor, onChange, onClose, onSave, saving }) {
  const isAiProvider = editor.kind === "ai";

  function updateField(field, value) {
    onChange((previous) => ({ ...previous, [field]: value }));
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.55)",
        padding: 16,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="ms-card" style={{ width: "100%", maxWidth: 760, padding: 20 }}>
        <div className="ms-card-hd" style={{ padding: 0, borderBottom: "none", marginBottom: 18 }}>
          <span className="ms-card-title">Edit {isAiProvider ? "AI" : "Telephony"} Provider</span>
          <button className="ms-btn" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <Field label="Name">
            <input className="ms-field-inp" value={editor.name} onChange={(event) => updateField("name", event.target.value)} />
          </Field>
          <Field label="Type">
            <input className="ms-field-inp" value={editor.type} readOnly />
          </Field>
          {isAiProvider ? (
            <>
              <Field label="Endpoint">
                <input className="ms-field-inp" value={editor.endpoint} onChange={(event) => updateField("endpoint", event.target.value)} />
              </Field>
              <Field label="Model">
                <input className="ms-field-inp" value={editor.model} onChange={(event) => updateField("model", event.target.value)} />
              </Field>
            </>
          ) : null}
          <Field label="API Key / Secret">
            <input className="ms-field-inp" value={editor.apiKey} onChange={(event) => updateField("apiKey", event.target.value)} />
          </Field>
          <Field label="Priority">
            <input
              className="ms-field-inp"
              type="number"
              value={editor.priority}
              onChange={(event) => updateField("priority", event.target.value)}
            />
          </Field>
          <Field label="Timeout (ms)">
            <input
              className="ms-field-inp"
              type="number"
              value={editor.timeoutMs}
              onChange={(event) => updateField("timeoutMs", event.target.value)}
            />
          </Field>
          <Field label="Enabled">
            <select className="ms-field-inp" value={editor.enabled ? "yes" : "no"} onChange={(event) => updateField("enabled", event.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Active">
            <select className="ms-field-inp" value={editor.isActive ? "yes" : "no"} onChange={(event) => updateField("isActive", event.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button className="ms-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ms-btn ms-btn-pri" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="ms-field" style={{ marginBottom: 0 }}>
      <div className="ms-field-lbl">{label}</div>
      {children}
    </div>
  );
}
