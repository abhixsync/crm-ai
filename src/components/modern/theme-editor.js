"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

/* ── Constants ──────────────────────────────────────────── */

const FONT_OPTIONS = [
  { value: "Geist, system-ui, sans-serif", label: "Geist (Default)" },
  { value: "'Inter', system-ui, sans-serif", label: "Inter" },
  { value: "'Roboto', system-ui, sans-serif", label: "Roboto" },
  { value: "'Open Sans', system-ui, sans-serif", label: "Open Sans" },
  { value: "'Lato', system-ui, sans-serif", label: "Lato" },
  { value: "'Manrope', system-ui, sans-serif", label: "Manrope" },
];

const SCALE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const COLOR_SECTIONS = [
  {
    title: "Brand",
    fields: [
      { key: "primaryColor", label: "Primary" },
      { key: "secondaryColor", label: "Secondary" },
      { key: "accentColor", label: "Accent" },
    ],
  },
  {
    title: "Surfaces",
    globalOnly: true,
    fields: [
      { key: "backgroundColor", label: "Background" },
      { key: "surfaceColor", label: "Surface" },
      { key: "sidebarColor", label: "Sidebar" },
      { key: "headerColor", label: "Header" },
    ],
  },
  {
    title: "Text & Borders",
    globalOnly: true,
    fields: [
      { key: "textPrimary", label: "Text Primary" },
      { key: "textSecondary", label: "Text Secondary" },
      { key: "borderColor", label: "Border" },
    ],
  },
  {
    title: "Status",
    globalOnly: true,
    fields: [
      { key: "successColor", label: "Success" },
      { key: "warningColor", label: "Warning" },
      { key: "errorColor", label: "Error" },
      { key: "infoColor", label: "Info" },
    ],
  },
];

const GLOBAL_ASSETS = [
  { key: "logo", urlKey: "logoUrl", label: "Logo" },
  { key: "favicon", urlKey: "faviconUrl", label: "Favicon" },
  { key: "loginBackground", urlKey: "loginBackgroundUrl", label: "Login Background" },
  { key: "applicationBackground", urlKey: "applicationBackgroundUrl", label: "App Background" },
];

const TENANT_ASSETS = [
  { key: "logo", urlKey: "logoUrl", label: "Logo" },
  { key: "favicon", urlKey: "faviconUrl", label: "Favicon" },
];

const MODULAR_SAVE_KEYS = [
  "primaryColor", "secondaryColor", "accentColor",
  "logoUrl", "faviconUrl", "customCss",
];

/* ── Helpers ────────────────────────────────────────────── */

function ColorCard({ label, value, onChange }) {
  const display = value || "#000000";
  return (
    <div style={{
      display: "flex", flexDirection: "column", borderRadius: 10,
      border: "1px solid var(--ms-border2)", overflow: "hidden",
      minWidth: 96, flex: "1 1 96px", maxWidth: 130,
    }}>
      <label style={{ display: "block", height: 48, background: display, cursor: "pointer", position: "relative" }}>
        <input
          type="color"
          value={display}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: "absolute", opacity: 0, inset: 0, width: "100%", height: "100%", cursor: "pointer", border: "none" }}
        />
      </label>
      <div style={{ padding: "5px 8px", background: "var(--ms-bg2)" }}>
        <div style={{ fontSize: 10, color: "var(--ms-text3)", marginBottom: 2, whiteSpace: "nowrap" }}>{label}</div>
        <input
          type="text"
          value={display}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
          }}
          onBlur={(e) => {
            if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) onChange(value);
          }}
          style={{
            fontSize: 11, fontFamily: "var(--font-geist-mono, monospace)",
            color: "var(--ms-text)", background: "transparent",
            border: "none", padding: 0, width: "100%", outline: "none",
          }}
        />
      </div>
    </div>
  );
}

function AssetCard({ label, url, onUpload, onClear, uploading }) {
  const ref = useRef(null);
  return (
    <div style={{
      borderRadius: 10, border: "1px solid var(--ms-border2)",
      overflow: "hidden", flex: "1 1 180px", minWidth: 160,
    }}>
      <div style={{
        height: 90, background: "var(--ms-bg3)",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      }}>
        {url
          ? <img src={url} alt={label} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
          : <span style={{ fontSize: 11, color: "var(--ms-text3)" }}>No {label.toLowerCase()}</span>
        }
      </div>
      <div style={{
        padding: "7px 10px", background: "var(--ms-bg2)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 11, color: "var(--ms-text2)", fontWeight: 500 }}>{label}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ""; }}
          />
          <button className="ms-btn" style={{ padding: "2px 8px", fontSize: 10 }}
            onClick={() => ref.current?.click()} disabled={uploading}>
            {uploading ? "..." : "Upload"}
          </button>
          {url && (
            <button className="ms-btn ms-btn-danger-ghost" style={{ padding: "2px 8px", fontSize: 10 }}
              onClick={onClear} disabled={uploading}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px", minWidth: 160 }}>
      <div className="ms-field-lbl">{label}</div>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "var(--ms-text3)",
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

/* ── Live Preview ───────────────────────────────────────── */

function ThemePreview({ theme }) {
  const c = {
    bg: theme.backgroundColor || "#f8fafc",
    sf: theme.surfaceColor || "#ffffff",
    sb: theme.sidebarColor || "#ffffff",
    hd: theme.headerColor || "#ffffff",
    pr: theme.primaryColor || "#2563eb",
    sc: theme.secondaryColor || "#64748b",
    ac: theme.accentColor || "#22c55e",
    t1: theme.textPrimary || "#0f172a",
    t2: theme.textSecondary || "#64748b",
    bd: theme.borderColor || "#e2e8f0",
    ok: theme.successColor || "#22c55e",
    wn: theme.warningColor || "#f59e0b",
    er: theme.errorColor || "#ef4444",
    in: theme.infoColor || "#3b82f6",
    cr: theme.cardRadius || "12px",
    br: theme.buttonRadius || "6px",
  };
  const bar = (w, bg, op = 1) => ({ width: w, height: 5, borderRadius: 3, background: bg, opacity: op });

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${c.bd}`, background: c.bg }}>
      <div style={{ display: "flex", height: 170 }}>
        {/* sidebar */}
        <div style={{ width: 44, background: c.sb, borderRight: `1px solid ${c.bd}`, padding: "8px 5px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={bar("100%", c.pr)} />
          <div style={bar("80%", c.t2, 0.3)} />
          <div style={bar("85%", c.t2, 0.3)} />
          <div style={bar("70%", c.t2, 0.3)} />
        </div>
        {/* main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* header */}
          <div style={{
            height: 26, background: c.hd, borderBottom: `1px solid ${c.bd}`,
            display: "flex", alignItems: "center", padding: "0 10px",
          }}>
            <div style={bar(44, c.t1, 0.5)} />
            <div style={{ marginLeft: "auto", width: 14, height: 14, borderRadius: "50%", background: c.ac, opacity: 0.6 }} />
          </div>
          {/* body */}
          <div style={{ flex: 1, padding: 8, display: "flex", gap: 8 }}>
            {/* card 1 */}
            <div style={{
              flex: 1, background: c.sf, borderRadius: c.cr,
              border: `1px solid ${c.bd}`, padding: 8,
              display: "flex", flexDirection: "column",
            }}>
              <div style={bar("65%", c.t1, 0.6)} />
              <div style={{ ...bar("85%", c.t2, 0.3), marginTop: 5 }} />
              <div style={{ ...bar("55%", c.t2, 0.3), marginTop: 3 }} />
              <div style={{ marginTop: "auto", display: "flex", gap: 4 }}>
                <span style={{ padding: "2px 8px", borderRadius: c.br, background: c.pr, fontSize: 8, color: "#fff", fontWeight: 600 }}>Save</span>
                <span style={{ padding: "2px 8px", borderRadius: c.br, border: `1px solid ${c.bd}`, fontSize: 8, color: c.t2, fontWeight: 500 }}>Cancel</span>
              </div>
            </div>
            {/* card 2 */}
            <div style={{
              flex: 1, background: c.sf, borderRadius: c.cr,
              border: `1px solid ${c.bd}`, padding: 8,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                {[c.ok, c.wn, c.er, c.in].map((clr, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: clr }} />
                ))}
              </div>
              <div style={bar("50%", c.t2, 0.3)} />
              <div style={{ ...bar("75%", c.t2, 0.3), marginTop: 3 }} />
              <span style={{
                marginTop: "auto", padding: "2px 8px", borderRadius: c.br,
                background: c.ac, textAlign: "center", fontSize: 8,
                color: c.t1, fontWeight: 600, display: "block",
              }}>
                Accent
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────── */

export function ThemeEditor({ mode = "tenant" }) {
  const [theme, setTheme] = useState(null);
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(null);
  const [status, setStatus] = useState(null);

  const isGlobal = mode === "global";
  const isDirty = theme && original && JSON.stringify(theme) !== JSON.stringify(original);

  /* ── fetch ── */
  const fetchTheme = useCallback(async (m) => {
    setLoading(true);
    try {
      const endpoint = m === "global" ? "/api/theme/inherited" : "/api/theme/active";
      const [tRes, sRes] = await Promise.all([fetch(endpoint), fetch("/api/theme/status")]);
      if (tRes.ok) {
        const d = await tRes.json();
        const t = d.theme || d;
        setTheme(t);
        setOriginal(t);
      }
      if (sRes.ok) setStatus(await sRes.json());
    } catch {
      toast.error("Failed to load theme");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTheme(mode); }, [fetchTheme]);

  /* ── actions ── */
  const updateField = (key, value) => setTheme((p) => ({ ...p, [key]: value }));

  const saveTheme = async () => {
    setSaving(true);
    try {
      let payload;
      if (isGlobal) {
        payload = { ...theme, isBaseTheme: true };
      } else {
        payload = {};
        MODULAR_SAVE_KEYS.forEach((k) => { if (theme[k] !== undefined) payload[k] = theme[k]; });
      }
      const res = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Theme saved");
        setOriginal({ ...theme });
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.error("Failed to save theme");
      }
    } catch {
      toast.error("Failed to save theme");
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => { setTheme({ ...original }); toast.info("Changes discarded"); };

  const resetToGlobal = async () => {
    if (!confirm("Reset tenant theme? This will revert all customizations to the global defaults.")) return;
    try {
      const res = await fetch("/api/theme/reset", { method: "POST" });
      if (res.ok) {
        toast.success("Theme reset to global defaults");
        fetchTheme(mode);
        setTimeout(() => window.location.reload(), 800);
      } else toast.error("Failed to reset theme");
    } catch { toast.error("Failed to reset theme"); }
  };

  const uploadAsset = async (type, file) => {
    setUploadingAsset(type);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      if (isGlobal) fd.append("isBaseTheme", "true");
      const res = await fetch("/api/admin/theme/assets", { method: "POST", body: fd });
      if (res.ok) {
        const d = await res.json();
        const t = d.theme || d;
        setTheme(t);
        setOriginal(t);
        toast.success(`${type} uploaded`);
      } else toast.error(`Failed to upload ${type}`);
    } catch { toast.error(`Failed to upload ${type}`); }
    finally { setUploadingAsset(null); }
  };

  const clearAsset = async (type, urlKey) => {
    updateField(urlKey, null);
    try {
      const payload = { [urlKey]: null };
      if (isGlobal) payload.isBaseTheme = true;
      await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success(`${type} cleared`);
    } catch { toast.error(`Failed to clear ${type}`); }
  };

  /* ── render ── */
  if (loading || !theme) {
    return <div className="ms-empty">{loading ? "Loading theme..." : "Failed to load theme."}</div>;
  }

  const colorSections = COLOR_SECTIONS.filter((s) => isGlobal || !s.globalOnly);
  const assets = isGlobal ? GLOBAL_ASSETS : TENANT_ASSETS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ms-text)" }}>
            {isGlobal ? "Global Theme" : "Tenant Theme"}
          </div>
          <div style={{ fontSize: 11, color: "var(--ms-text3)", marginTop: 2 }}>
            {isGlobal ? "Platform-wide defaults inherited by all tenants" : "Customize your organization's brand identity"}
          </div>
        </div>
        {!isGlobal && status && (
          <span className="ms-bdg" style={{
            background: status.hasCustomTheme ? "var(--ms-accent-dim)" : "rgba(79,156,249,.14)",
            color: status.hasCustomTheme ? "var(--ms-accent-txt)" : "#93c5fd",
          }}>
            {status.hasCustomTheme ? "Custom" : "Inherited"}
          </span>
        )}
      </div>

      {/* two-column: colors + preview */}
      <div className="ms-grid-side" style={{ alignItems: "start" }}>
        {/* colors */}
        <div className="ms-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Colors</div>
          {colorSections.map((section, i) => (
            <div key={section.title} style={{ marginBottom: i < colorSections.length - 1 ? 20 : 0 }}>
              <SectionTitle>{section.title}</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {section.fields.map((f) => (
                  <ColorCard key={f.key} label={f.label} value={theme[f.key]} onChange={(v) => updateField(f.key, v)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* preview */}
        <div className="ms-card" style={{ padding: 16, position: "sticky", top: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ms-text)", marginBottom: 10 }}>Live Preview</div>
          <ThemePreview theme={theme} />
        </div>
      </div>

      {/* typography & shape (global only) */}
      {isGlobal && (
        <div className="ms-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Typography & Shape</div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
            <FormRow label="Font Family">
              <select className="ms-field-inp" value={theme.fontFamily || ""} onChange={(e) => updateField("fontFamily", e.target.value)}>
                {FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormRow>
            <FormRow label="Font Scale">
              <select className="ms-field-inp" value={theme.fontScale || "medium"} onChange={(e) => updateField("fontScale", e.target.value)}>
                {SCALE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormRow>
            <FormRow label="Shadow Intensity">
              <select className="ms-field-inp" value={theme.shadowIntensity || "medium"} onChange={(e) => updateField("shadowIntensity", e.target.value)}>
                {SHADOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormRow>
            <FormRow label="Layout Density">
              <select className="ms-field-inp" value={theme.layoutDensity || "comfortable"} onChange={(e) => updateField("layoutDensity", e.target.value)}>
                {DENSITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormRow>
          </div>

          <SectionTitle>Border Radius</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {[
              { key: "borderRadius", label: "Default" },
              { key: "buttonRadius", label: "Button" },
              { key: "cardRadius", label: "Card" },
              { key: "inputRadius", label: "Input" },
            ].map(({ key, label }) => (
              <FormRow key={key} label={label}>
                <input className="ms-field-inp" type="text" value={theme[key] || ""} onChange={(e) => updateField(key, e.target.value)} placeholder="e.g. 8px" style={{ maxWidth: 120 }} />
              </FormRow>
            ))}
          </div>
        </div>
      )}

      {/* assets */}
      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Brand Assets</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {assets.map((a) => (
            <AssetCard key={a.key} label={a.label} url={theme[a.urlKey]}
              uploading={uploadingAsset === a.key}
              onUpload={(file) => uploadAsset(a.key, file)}
              onClear={() => clearAsset(a.key, a.urlKey)}
            />
          ))}
        </div>
      </div>

      {/* advanced */}
      <div className="ms-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ms-text)", marginBottom: 16 }}>Advanced</div>
        {isGlobal && (
          <div style={{ marginBottom: 14 }}>
            <FormRow label="Theme Name">
              <input className="ms-field-inp" type="text" value={theme.themeName || ""} onChange={(e) => updateField("themeName", e.target.value)} placeholder="Default Theme" />
            </FormRow>
          </div>
        )}
        <FormRow label="Custom CSS">
          <textarea className="ms-field-inp" value={theme.customCss || ""} onChange={(e) => updateField("customCss", e.target.value)}
            placeholder="/* Your custom CSS here */" rows={6}
            style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: 12, resize: "vertical" }}
          />
        </FormRow>
        <div style={{ fontSize: 10, color: "var(--ms-text3)", marginTop: 4 }}>
          Script tags, @import, and javascript: URLs are stripped automatically.
        </div>
      </div>

      {/* action bar */}
      <div className="ms-card" style={{
        padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", bottom: 0, zIndex: 10,
      }}>
        <div>
          {!isGlobal && status?.hasCustomTheme && (
            <button className="ms-btn ms-btn-danger-ghost" onClick={resetToGlobal} style={{ fontSize: 12 }}>
              Reset to Global
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isDirty && (
            <button className="ms-btn" onClick={discardChanges} style={{ fontSize: 12 }}>Discard</button>
          )}
          <button className="ms-btn ms-btn-pri" onClick={saveTheme} disabled={saving || !isDirty} style={{ fontSize: 12, padding: "8px 20px" }}>
            {saving ? "Saving..." : "Save Theme"}
          </button>
        </div>
      </div>
    </div>
  );
}
