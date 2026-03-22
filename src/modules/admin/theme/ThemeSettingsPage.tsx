"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/loader";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useTheme } from "@/core/theme/useTheme";
import { SYSTEM_THEME_DEFAULT } from "@/core/theme/system-defaults";
import { getContrastHint, sanitizeThemeCustomCss } from "@/core/theme/theme-utils";

type SessionUser = {
  role?: "SUPER_ADMIN" | "ADMIN" | "SALES";
  tenantId?: string | null;
};

type TenantOption = {
  id: string;
  name: string;
};

type ThemeStatus = {
  hasCustomTheme: boolean;
  source: "default" | "base" | "tenant";
  updatedAt: string | null;
  canReset: boolean;
};

type ThemeDraft = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  fontFamily: string;
  fontScale: string;
  layoutDensity: string;
  customCss: string;
};

type PreviewMode = "light" | "dark";

type SectionKey = "colors" | "typography" | "layout" | "advanced";

const FONT_OPTIONS = [
  "Inter, system-ui, sans-serif",
  "Roboto, system-ui, sans-serif",
  "Open Sans, system-ui, sans-serif",
  "Lato, system-ui, sans-serif",
  "Manrope, system-ui, sans-serif",
];

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function toHexColor(input: string, fallback: string) {
  const value = String(input || "").trim();
  return HEX_REGEX.test(value) ? value : fallback;
}

function hexToHsl(hex: string) {
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;

  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  if (max === g) h = (b - r) / d + 2;
  if (max === b) h = (r - g) / d + 4;

  h /= 6;

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (channel: number) => {
    const value = Math.round((channel + m) * 255);
    return value.toString(16).padStart(2, "0");
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function buildDraftFromTheme(theme: Record<string, unknown>): ThemeDraft {
  return {
    primaryColor: toHexColor(String(theme.primaryColor || ""), SYSTEM_THEME_DEFAULT.primaryColor),
    secondaryColor: toHexColor(String(theme.secondaryColor || ""), SYSTEM_THEME_DEFAULT.secondaryColor),
    accentColor: toHexColor(String(theme.accentColor || ""), SYSTEM_THEME_DEFAULT.accentColor),
    backgroundColor: toHexColor(String(theme.backgroundColor || ""), SYSTEM_THEME_DEFAULT.backgroundColor),
    surfaceColor: toHexColor(String(theme.surfaceColor || ""), SYSTEM_THEME_DEFAULT.surfaceColor),
    textPrimary: toHexColor(String(theme.textPrimary || ""), SYSTEM_THEME_DEFAULT.textPrimary),
    textSecondary: toHexColor(String(theme.textSecondary || ""), SYSTEM_THEME_DEFAULT.textSecondary),
    borderColor: toHexColor(String(theme.borderColor || ""), SYSTEM_THEME_DEFAULT.borderColor),
    fontFamily: String(theme.fontFamily || SYSTEM_THEME_DEFAULT.fontFamily),
    fontScale: String(theme.fontScale || SYSTEM_THEME_DEFAULT.fontScale),
    layoutDensity: String(theme.layoutDensity || SYSTEM_THEME_DEFAULT.layoutDensity),
    customCss: String(theme.customCss || ""),
  };
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const hsl = useMemo(() => hexToHsl(value), [value]);

  return (
    <div className="theme-editor-color-control space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div className="grid grid-cols-[42px_1fr] gap-2">
        <Input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} color picker`}
          className="w-[42px] p-1"
        />
        <Input
          value={value}
          onChange={(event) => onChange(toHexColor(event.target.value, value))}
          aria-label={`${label} hex value`}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input
          type="number"
          min={0}
          max={360}
          value={hsl.h}
          onChange={(event) => onChange(hslToHex(Number(event.target.value), hsl.s, hsl.l))}
          aria-label={`${label} hue`}
        />
        <Input
          type="number"
          min={0}
          max={100}
          value={hsl.s}
          onChange={(event) => onChange(hslToHex(hsl.h, Number(event.target.value), hsl.l))}
          aria-label={`${label} saturation`}
        />
        <Input
          type="number"
          min={0}
          max={100}
          value={hsl.l}
          onChange={(event) => onChange(hslToHex(hsl.h, hsl.s, Number(event.target.value)))}
          aria-label={`${label} lightness`}
        />
      </div>
    </div>
  );
}

export function ThemeSettingsPage() {
  const { data: session } = useSession();
  const { theme, setThemeOptimistic, refreshTheme } = useTheme();

  const user = (session?.user || {}) as SessionUser;
  const canManage = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const isSuperAdmin = user.role === "SUPER_ADMIN";

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [themeStatus, setThemeStatus] = useState<ThemeStatus | null>(null);
  const [inheritedDraft, setInheritedDraft] = useState<ThemeDraft>(() => buildDraftFromTheme(SYSTEM_THEME_DEFAULT));
  const [draft, setDraft] = useState<ThemeDraft>(() => buildDraftFromTheme(SYSTEM_THEME_DEFAULT));
  const [savedSnapshot, setSavedSnapshot] = useState<ThemeDraft>(() => buildDraftFromTheme(SYSTEM_THEME_DEFAULT));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("light");
  const [applyRecommendedOpen, setApplyRecommendedOpen] = useState(false);
  const [applyingRecommended, setApplyingRecommended] = useState(false);

  const importRef = useRef<HTMLInputElement | null>(null);
  const applyModalRef = useRef<HTMLDivElement | null>(null);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedSnapshot),
    [draft, savedSnapshot]
  );

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  const applyTarget = useMemo(() => {
    if (!canManage) return null;

    if (isSuperAdmin) {
      if (selectedTenantId) {
        return {
          tenantId: selectedTenantId,
          isBaseTheme: false,
          label: selectedTenant?.name || "selected tenant",
          overwritesTenantTheme: Boolean(themeStatus?.hasCustomTheme),
          description: "Apply recommended tokens directly to the selected tenant.",
        };
      }

      return {
        tenantId: null,
        isBaseTheme: true,
        label: "Base theme",
        overwritesTenantTheme: false,
        description: "Apply recommended tokens to the base theme inherited by tenants without custom overrides.",
      };
    }

    return {
      tenantId: selectedTenantId || String(user.tenantId || ""),
      isBaseTheme: false,
      label: "your tenant",
      overwritesTenantTheme: Boolean(themeStatus?.hasCustomTheme),
      description: "Apply recommended tokens to your tenant theme.",
    };
  }, [canManage, isSuperAdmin, selectedTenant, selectedTenantId, themeStatus?.hasCustomTheme, user.tenantId]);

  const textContrast = useMemo(() => getContrastHint(draft.textPrimary, draft.backgroundColor), [draft]);

  const previewStyle = useMemo(
    () => ({
      background: previewMode === "dark" ? "#0b1220" : `linear-gradient(135deg, ${draft.backgroundColor}, ${draft.surfaceColor})`,
      color: previewMode === "dark" ? "#e2e8f0" : draft.textPrimary,
      borderColor: draft.borderColor,
      fontFamily: draft.fontFamily,
    }),
    [draft, previewMode]
  );

  useEffect(() => {
    setSelectedTenantId(String(user.tenantId || ""));
  }, [user.tenantId]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const loadTenants = async () => {
      try {
        const response = await fetch("/api/admin/tenants", { cache: "no-store" });
        const payload = await response.json();
        const nextTenants = Array.isArray(payload?.tenants)
          ? payload.tenants.map((tenant: { id: string; name: string }) => ({ id: tenant.id, name: tenant.name }))
          : [];
        setTenants(nextTenants);
      } catch {
        setTenants([]);
      }
    };

    loadTenants();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    if (!selectedTenantId) {
      const fallback = buildDraftFromTheme(SYSTEM_THEME_DEFAULT);
      setDraft(fallback);
      setSavedSnapshot(fallback);
      setThemeStatus(null);
      setInheritedDraft(buildDraftFromTheme(SYSTEM_THEME_DEFAULT));
      setLoading(false);
      return;
    }

    const loadThemeState = async () => {
      setLoading(true);
      try {
        const activeRes = await fetch(`/api/theme/active?tenantId=${encodeURIComponent(selectedTenantId)}`, { cache: "no-store" });
        const activePayload = await activeRes.json();
        const activeTheme = activePayload?.theme || SYSTEM_THEME_DEFAULT;

        const statusRes = await fetch(`/api/theme/status?tenantId=${encodeURIComponent(selectedTenantId)}`, { cache: "no-store" });
        const statusPayload = await statusRes.json();

        const inheritedRes = await fetch("/api/theme/inherited", { cache: "no-store" });
        const inheritedPayload = await inheritedRes.json();

        const nextDraft = buildDraftFromTheme(activeTheme);
        setDraft(nextDraft);
        setSavedSnapshot(nextDraft);
        setThemeStatus(statusPayload?.status || null);
        setInheritedDraft(buildDraftFromTheme(inheritedPayload?.theme || SYSTEM_THEME_DEFAULT));
        setThemeOptimistic(activeTheme);
      } catch {
        const fallback = buildDraftFromTheme(SYSTEM_THEME_DEFAULT);
        setDraft(fallback);
        setSavedSnapshot(fallback);
        setThemeStatus(null);
      } finally {
        setLoading(false);
      }
    };

    loadThemeState();
  }, [canManage, selectedTenantId, setThemeOptimistic]);

  useEffect(() => {
    if (!canManage) return;

    const timeout = setTimeout(() => {
      setThemeOptimistic({
        primaryColor: draft.primaryColor,
        secondaryColor: draft.secondaryColor,
        accentColor: draft.accentColor,
        backgroundColor: draft.backgroundColor,
        surfaceColor: draft.surfaceColor,
        textPrimary: draft.textPrimary,
        textSecondary: draft.textSecondary,
        borderColor: draft.borderColor,
        fontFamily: draft.fontFamily,
        fontScale: draft.fontScale,
        layoutDensity: draft.layoutDensity,
      });
    }, 120);

    return () => clearTimeout(timeout);
  }, [canManage, draft, setThemeOptimistic]);

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
          customCss: sanitizeThemeCustomCss(draft.customCss),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save theme.");
      }

      const nextDraft = buildDraftFromTheme(payload?.theme || draft);
      setDraft(nextDraft);
      setSavedSnapshot(nextDraft);
      toast.success("Theme saved.");
      await refreshTheme();
    } catch (error) {
      toast.error((error as Error).message || "Unable to save theme.");
    } finally {
      setSaving(false);
    }
  }

  async function resetTenantTheme() {
    if (!canManage || !selectedTenantId || !themeStatus?.canReset) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/theme/reset?tenantId=${encodeURIComponent(selectedTenantId)}`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to reset theme");
      }

      const nextDraft = buildDraftFromTheme(payload?.theme || inheritedDraft);
      setDraft(nextDraft);
      setSavedSnapshot(nextDraft);
      setThemeStatus((previous) => previous ? { ...previous, hasCustomTheme: false, canReset: false, source: payload?.theme?.source || "base" } : previous);
      toast.success("Theme reset to inherited defaults.");
      await refreshTheme();
    } catch (error) {
      toast.error((error as Error).message || "Failed to reset theme");
    } finally {
      setSaving(false);
    }
  }

  async function applyRecommendedTheme() {
    if (!canManage || !applyTarget) return;

    const recommendedDraft = buildDraftFromTheme(SYSTEM_THEME_DEFAULT);

    setApplyingRecommended(true);
    try {
      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(applyTarget.tenantId ? { tenantId: applyTarget.tenantId } : {}),
          ...(applyTarget.isBaseTheme ? { isBaseTheme: true } : {}),
          ...recommendedDraft,
          customCss: sanitizeThemeCustomCss(recommendedDraft.customCss),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to apply recommended theme.");
      }

      const nextDraft = buildDraftFromTheme(payload?.theme || recommendedDraft);
      setDraft(nextDraft);
      setSavedSnapshot(nextDraft);
      setApplyRecommendedOpen(false);

      if (applyTarget.isBaseTheme) {
        setThemeStatus(null);
        toast.success("Recommended theme applied to base theme.");
      } else {
        setThemeStatus((previous) => previous
          ? { ...previous, hasCustomTheme: true, canReset: true, source: "tenant" }
          : {
            hasCustomTheme: true,
            canReset: true,
            source: "tenant",
            updatedAt: new Date().toISOString(),
          });
        toast.success(`Recommended theme applied to ${applyTarget.label}.`);
      }

      await refreshTheme();
    } catch (error) {
      toast.error((error as Error).message || "Unable to apply recommended theme.");
    } finally {
      setApplyingRecommended(false);
    }
  }

  function resetSection(section: SectionKey) {
    const source = inheritedDraft;

    setDraft((current) => {
      if (section === "colors") {
        return {
          ...current,
          primaryColor: source.primaryColor,
          secondaryColor: source.secondaryColor,
          accentColor: source.accentColor,
          backgroundColor: source.backgroundColor,
          surfaceColor: source.surfaceColor,
          textPrimary: source.textPrimary,
          textSecondary: source.textSecondary,
          borderColor: source.borderColor,
        };
      }

      if (section === "typography") {
        return {
          ...current,
          fontFamily: source.fontFamily,
          fontScale: source.fontScale,
        };
      }

      if (section === "layout") {
        return {
          ...current,
          layoutDensity: source.layoutDensity,
        };
      }

      return {
        ...current,
        customCss: source.customCss,
      };
    });
  }

  async function uploadAsset(
    assetKey: "logo" | "favicon" | "loginBackground" | "applicationBackground",
    file: File | null
  ) {
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

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to upload asset.");
      }

      toast.success(`${assetKey} uploaded.`);
      setThemeOptimistic(payload?.theme || {});
      await refreshTheme();
    } catch (error) {
      toast.error((error as Error).message || "Unable to upload asset.");
    } finally {
      setUploading(false);
    }
  }

  async function clearAsset(assetKey: "logo" | "favicon" | "loginBackground" | "applicationBackground") {
    if (!canManage || !selectedTenantId) return;

    setSaving(true);
    try {
      const patch: Record<string, string | null> = {};
      if (assetKey === "logo") patch.logoUrl = null;
      if (assetKey === "favicon") patch.faviconUrl = null;
      if (assetKey === "loginBackground") patch.loginBackgroundUrl = null;
      if (assetKey === "applicationBackground") patch.applicationBackgroundUrl = null;

      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId, ...patch }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to clear asset.");
      }

      toast.success(`${assetKey} cleared.`);
      setThemeOptimistic(payload?.theme || {});
      await refreshTheme();
    } catch (error) {
      toast.error((error as Error).message || "Unable to clear asset.");
    } finally {
      setSaving(false);
    }
  }

  function exportThemeJson() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      draft,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tenant-theme-${selectedTenantId || "draft"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importThemeJson(file: File | null) {
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as { draft?: Partial<ThemeDraft> };
      const incoming = payload?.draft || {};

      setDraft((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(incoming).filter(([key]) => key in current)
        ),
      }));

      toast.success("Theme JSON imported into draft.");
    } catch {
      toast.error("Invalid theme JSON file.");
    }
  }

  if (loading) {
    return <PageLoader label="Loading theme settings..." />;
  }

  return (
    <div className="theme-editor-root space-y-6 pb-28">
      <div className="theme-editor-layout grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="theme-editor-main">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Tenant Theme Editor
              {themeStatus ? (
                <span className={`theme-editor-pill inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${themeStatus.hasCustomTheme ? "theme-editor-pill-custom bg-blue-100 text-blue-800" : "theme-editor-pill-inherited bg-slate-100 text-slate-700"}`}>
                  {themeStatus.hasCustomTheme ? "Custom" : "Inherited"}
                </span>
              ) : null}
              {hasUnsavedChanges ? (
                <span className="theme-editor-pill theme-editor-pill-warning inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                  Unsaved changes
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>
              Enterprise theming with safe inheritance, white-label controls, and token-level editing.
            </CardDescription>
          </CardHeader>
          <CardContent className="theme-editor-content space-y-6">
            {isSuperAdmin ? (
              <label className="theme-editor-scope space-y-2">
                <span className="text-sm font-medium text-muted-foreground">Target Scope</span>
                <Select
                  className="w-full"
                  value={selectedTenantId}
                  onChange={(event) => setSelectedTenantId(event.target.value)}
                  aria-label="Select tenant for theme editing"
                >
                  <option value="">Base theme (all tenants without custom overrides)</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-muted-foreground">
                  Choose a tenant to edit only that tenant, or keep Base theme selected to manage inherited defaults.
                </span>
              </label>
            ) : null}

            {applyTarget?.overwritesTenantTheme ? (
              <div className="theme-editor-callout theme-editor-callout-warning rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This tenant currently has a custom theme. Applying recommended tokens will overwrite tenant-specific values.
              </div>
            ) : null}

            <section className="theme-editor-section space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-foreground">Color Tokens</h3>
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => resetSection("colors")} disabled={!canManage}>
                  Reset to inherit
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ColorControl label="Primary" value={draft.primaryColor} onChange={(next) => setDraft((prev) => ({ ...prev, primaryColor: next }))} />
                <ColorControl label="Secondary" value={draft.secondaryColor} onChange={(next) => setDraft((prev) => ({ ...prev, secondaryColor: next }))} />
                <ColorControl label="Accent" value={draft.accentColor} onChange={(next) => setDraft((prev) => ({ ...prev, accentColor: next }))} />
                <ColorControl label="Background" value={draft.backgroundColor} onChange={(next) => setDraft((prev) => ({ ...prev, backgroundColor: next }))} />
                <ColorControl label="Surface" value={draft.surfaceColor} onChange={(next) => setDraft((prev) => ({ ...prev, surfaceColor: next }))} />
                <ColorControl label="Text Primary" value={draft.textPrimary} onChange={(next) => setDraft((prev) => ({ ...prev, textPrimary: next }))} />
                <ColorControl label="Text Secondary" value={draft.textSecondary} onChange={(next) => setDraft((prev) => ({ ...prev, textSecondary: next }))} />
                <ColorControl label="Border" value={draft.borderColor} onChange={(next) => setDraft((prev) => ({ ...prev, borderColor: next }))} />
              </div>
              <p className={`text-xs ${textContrast.level === "FAIL" ? "text-rose-600" : "text-muted-foreground"}`}>
                Contrast hint: {textContrast.level} ({textContrast.ratio.toFixed(2)}:1) for text-primary on background.
              </p>
            </section>

            <section className="theme-editor-section space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-foreground">Typography</h3>
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => resetSection("typography")} disabled={!canManage}>
                  Reset to inherit
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-muted-foreground">
                  <span>Font Family</span>
                  <Select
                    className="w-full"
                    value={draft.fontFamily}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fontFamily: event.target.value }))}
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2 text-sm text-muted-foreground">
                  <span>Font Scale</span>
                  <Select
                    className="w-full"
                    value={draft.fontScale}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fontScale: event.target.value }))}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </Select>
                </label>
              </div>
            </section>

            <section className="theme-editor-section space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-foreground">Layout & Density</h3>
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => resetSection("layout")} disabled={!canManage}>
                  Reset to inherit
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-muted-foreground">
                  <span>Density</span>
                  <Select
                    className="w-full"
                    value={draft.layoutDensity}
                    onChange={(event) => setDraft((prev) => ({ ...prev, layoutDensity: event.target.value }))}
                  >
                    <option value="compact">Compact</option>
                    <option value="comfortable">Comfortable</option>
                    <option value="spacious">Spacious</option>
                  </Select>
                </label>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <span>Theme Mode Preview</span>
                  <div className="flex gap-2">
                    <Button variant={previewMode === "light" ? "default" : "secondary"} onClick={() => setPreviewMode("light")}>Light</Button>
                    <Button variant={previewMode === "dark" ? "default" : "secondary"} onClick={() => setPreviewMode("dark")}>Dark</Button>
                  </div>
                </div>
              </div>
            </section>

            <section className="theme-editor-section space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-foreground">Assets</h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="w-full sm:w-auto" variant="secondary" onClick={exportThemeJson}>
                    <Download className="h-4 w-4" /> Export JSON
                  </Button>
                  <Button className="w-full sm:w-auto" variant="secondary" onClick={() => importRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Import JSON
                  </Button>
                  <input
                    ref={importRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(event) => importThemeJson(event.target.files?.[0] || null)}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Logo</span>
                  {theme.logoUrl ? (
                    <div className="theme-editor-asset-preview mb-2 flex items-center gap-2">
                      <img src={theme.logoUrl} alt="Current logo" className="h-8 w-auto rounded border" />
                      <Button variant="secondary" onClick={() => clearAsset("logo")} disabled={saving}>Clear</Button>
                    </div>
                  ) : null}
                  <Input type="file" accept="image/*" disabled={uploading} onChange={(event) => uploadAsset("logo", event.target.files?.[0] || null)} />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Favicon</span>
                  {theme.faviconUrl ? (
                    <div className="theme-editor-asset-preview mb-2 flex items-center gap-2">
                      <img src={theme.faviconUrl} alt="Current favicon" className="h-6 w-6 rounded border" />
                      <Button variant="secondary" onClick={() => clearAsset("favicon")} disabled={saving}>Clear</Button>
                    </div>
                  ) : null}
                  <Input type="file" accept="image/*" disabled={uploading} onChange={(event) => uploadAsset("favicon", event.target.files?.[0] || null)} />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Login Background</span>
                  {theme.loginBackgroundUrl ? (
                    <div className="theme-editor-asset-preview mb-2 flex items-center gap-2">
                      <img src={theme.loginBackgroundUrl} alt="Current login background" className="h-12 w-20 rounded border object-cover" />
                      <Button variant="secondary" onClick={() => clearAsset("loginBackground")} disabled={saving}>Clear</Button>
                    </div>
                  ) : null}
                  <Input type="file" accept="image/*" disabled={uploading} onChange={(event) => uploadAsset("loginBackground", event.target.files?.[0] || null)} />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Application Background</span>
                  {theme.applicationBackgroundUrl ? (
                    <div className="theme-editor-asset-preview mb-2 flex items-center gap-2">
                      <img src={theme.applicationBackgroundUrl} alt="Current application background" className="h-12 w-20 rounded border object-cover" />
                      <Button variant="secondary" onClick={() => clearAsset("applicationBackground")} disabled={saving}>Clear</Button>
                    </div>
                  ) : null}
                  <Input type="file" accept="image/*" disabled={uploading} onChange={(event) => uploadAsset("applicationBackground", event.target.files?.[0] || null)} />
                </label>
              </div>
            </section>

            <section className="theme-editor-section space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-foreground">Advanced</h3>
                <Button className="w-full sm:w-auto" variant="secondary" onClick={() => resetSection("advanced")} disabled={!canManage}>
                  Reset to inherit
                </Button>
              </div>
              <label className="space-y-1 text-sm text-muted-foreground">
                <span>Custom CSS (sanitized)</span>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-border bg-background p-3 text-sm text-foreground"
                  value={draft.customCss}
                  onChange={(event) => setDraft((prev) => ({ ...prev, customCss: event.target.value }))}
                  placeholder=".my-brand-widget { border-radius: 14px; }"
                />
                <span className="text-xs text-muted-foreground">
                  For safety, script tags, @import and javascript: URL patterns are removed before apply/save.
                </span>
              </label>
            </section>
          </CardContent>
        </Card>

        <Card className="theme-editor-preview-card">
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>Theme preview for card, button, and table behaviors.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="theme-editor-live-preview space-y-4 rounded-lg border p-4" style={previewStyle}>
              <div className="theme-editor-preview-panel rounded-md border p-4" style={{ background: draft.surfaceColor, borderColor: draft.borderColor }}>
                <h4 className="text-sm font-semibold" style={{ color: draft.textPrimary }}>Themed Card</h4>
                <p className="mt-1 text-sm" style={{ color: draft.textSecondary }}>
                  This card previews typography, background/surface, and border tokens.
                </p>
                <Button
                  className="mt-3"
                  style={{ backgroundColor: draft.primaryColor, borderColor: draft.primaryColor, color: "#fff" }}
                >
                  Themed Button
                </Button>
              </div>

              <div className="themed-table overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left">Lead</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2">Aarav Singh</td>
                      <td className="px-3 py-2">Interested</td>
                    </tr>
                    <tr data-state="selected">
                      <td className="px-3 py-2">Neha Sharma</td>
                      <td className="px-3 py-2">Follow Up</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="theme-savebar theme-editor-savebar fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {hasUnsavedChanges ? "You have unsaved theme changes." : "All changes saved."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setApplyRecommendedOpen(true)}
              disabled={!canManage || saving || applyingRecommended || !applyTarget}
              loading={applyingRecommended}
              loadingText="Applying..."
            >
              Apply Recommended Theme
            </Button>
            <Button variant="secondary" onClick={() => setDraft(savedSnapshot)} disabled={!hasUnsavedChanges || saving}>
              Discard
            </Button>
            <Button variant="secondary" onClick={resetTenantTheme} disabled={!themeStatus?.canReset} loading={saving} loadingText="Resetting...">
              Reset Tenant Theme
            </Button>
            <Button
              onClick={saveTheme}
              disabled={!canManage || !selectedTenantId || !hasUnsavedChanges || applyingRecommended}
              loading={saving}
              loadingText="Saving theme..."
            >
              Save Theme
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={applyRecommendedOpen}
        onClose={() => {
          if (!applyingRecommended) {
            setApplyRecommendedOpen(false);
          }
        }}
        title="Apply Recommended Theme"
        description={applyTarget?.description}
        ariaLabel="Apply recommended theme confirmation"
        dialogRef={applyModalRef}
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Target: <span className="font-medium text-foreground">{applyTarget?.label || "-"}</span>
          </p>
          {applyTarget?.isBaseTheme ? (
            <p className="theme-editor-callout rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              This updates inherited defaults for tenants that do not have active custom themes.
            </p>
          ) : null}
          {applyTarget?.overwritesTenantTheme ? (
            <p className="theme-editor-callout theme-editor-callout-warning rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Warning: this replaces the selected tenant&apos;s current custom theme values.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setApplyRecommendedOpen(false)} disabled={applyingRecommended}>
              Cancel
            </Button>
            <Button onClick={applyRecommendedTheme} loading={applyingRecommended} loadingText="Applying theme...">
              Confirm Apply
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
