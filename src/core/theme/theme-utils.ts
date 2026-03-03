import type { ThemeTokens } from "@/core/theme/system-defaults";

export type ThemeSemanticTokens = {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  fontSans: string;
  fontHeading: string;
  fontMono: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  spacingUnit: string;
};

function toHex(input: string): string {
  const value = String(input || "").trim().toLowerCase();

  if (!value.startsWith("#")) {
    return "#000000";
  }

  if (value.length === 4) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  if (value.length === 7) {
    return value;
  }

  return "#000000";
}

function parseRgb(hexValue: string) {
  const hex = toHex(hexValue);
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function relativeLuminance(color: string) {
  const { r, g, b } = parseRgb(color);
  const srgb = [r, g, b].map((component) => {
    const channel = component / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(a: string, b: string) {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableForeground(background: string) {
  const light = "#ffffff";
  const dark = "#0f172a";
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

export function mergeThemeTokens(base: ThemeTokens, overrides: Partial<ThemeTokens>): ThemeTokens {
  return {
    ...base,
    ...overrides,
  };
}

export function getThemeSemanticTokens(theme: ThemeTokens): ThemeSemanticTokens {
  return {
    primary: theme.primaryColor,
    primaryForeground: readableForeground(theme.primaryColor),
    secondary: theme.secondaryColor,
    secondaryForeground: readableForeground(theme.secondaryColor),
    accent: theme.accentColor,
    accentForeground: readableForeground(theme.accentColor),
    muted: theme.backgroundColor,
    mutedForeground: theme.textSecondary,
    destructive: theme.errorColor,
    destructiveForeground: readableForeground(theme.errorColor),
    border: theme.borderColor,
    input: theme.borderColor,
    ring: theme.primaryColor,
    background: theme.backgroundColor,
    foreground: theme.textPrimary,
    card: theme.surfaceColor,
    cardForeground: theme.textPrimary,
    popover: theme.surfaceColor,
    popoverForeground: theme.textPrimary,
    fontSans: theme.fontFamily,
    fontHeading: theme.fontFamily,
    fontMono: "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    radiusSm: "6px",
    radiusMd: theme.borderRadius || "8px",
    radiusLg: theme.cardRadius || "12px",
    spacingUnit: theme.layoutDensity === "compact" ? "0.75rem" : theme.layoutDensity === "spacious" ? "1.25rem" : "1rem",
  };
}

export function getThemeCssVariables(theme: ThemeTokens): Record<string, string> {
  const semantic = getThemeSemanticTokens(theme);

  const baseVars: Record<string, string> = {
    "--background": theme.backgroundColor,
    "--foreground": theme.textPrimary,
    "--color-primary": theme.primaryColor,
    "--color-secondary": theme.secondaryColor,
    "--color-accent": theme.accentColor,
    "--color-background": theme.backgroundColor,
    "--color-surface": theme.surfaceColor,
    "--color-sidebar": theme.sidebarColor,
    "--color-header": theme.headerColor,
    "--color-text-primary": theme.textPrimary,
    "--color-text-secondary": theme.textSecondary,
    "--color-border": theme.borderColor,
    "--color-success": theme.successColor,
    "--color-warning": theme.warningColor,
    "--color-error": theme.errorColor,
    "--color-info": theme.infoColor,
    "--font-family": theme.fontFamily,
    "--font-scale": theme.fontScale,
    "--border-radius": theme.borderRadius,
    "--button-radius": theme.buttonRadius,
    "--card-radius": theme.cardRadius,
    "--input-radius": theme.inputRadius,
    "--shadow-intensity": theme.shadowIntensity,
    "--layout-density": theme.layoutDensity,
    "--sidebar-style": theme.sidebarStyle,
    "--table-style": theme.tableStyle,
    "--dark-mode": theme.darkMode ? "true" : "false",
  };

  const semanticVars: Record<string, string> = {
    "--primary": semantic.primary,
    "--primary-foreground": semantic.primaryForeground,
    "--secondary": semantic.secondary,
    "--secondary-foreground": semantic.secondaryForeground,
    "--accent": semantic.accent,
    "--accent-foreground": semantic.accentForeground,
    "--muted": semantic.muted,
    "--muted-foreground": semantic.mutedForeground,
    "--destructive": semantic.destructive,
    "--destructive-foreground": semantic.destructiveForeground,
    "--border": semantic.border,
    "--input": semantic.input,
    "--ring": semantic.ring,
    "--card": semantic.card,
    "--card-foreground": semantic.cardForeground,
    "--popover": semantic.popover,
    "--popover-foreground": semantic.popoverForeground,
    "--font-sans": semantic.fontSans,
    "--font-heading": semantic.fontHeading,
    "--font-mono": semantic.fontMono,
    "--radius-sm": semantic.radiusSm,
    "--radius-md": semantic.radiusMd,
    "--radius-lg": semantic.radiusLg,
    "--radius": semantic.radiusMd,
    "--spacing-unit": semantic.spacingUnit,
  };

  const appBackground = theme.applicationBackgroundUrl
    ? `url(${theme.applicationBackgroundUrl})`
    : `linear-gradient(135deg, ${theme.backgroundColor} 0%, ${theme.surfaceColor} 100%)`;

  return {
    ...baseVars,
    ...semanticVars,
    "--bg-application": appBackground,
  };
}

export function getThemeFingerprint(theme: ThemeTokens) {
  return JSON.stringify([
    theme.primaryColor,
    theme.secondaryColor,
    theme.accentColor,
    theme.backgroundColor,
    theme.surfaceColor,
    theme.textPrimary,
    theme.textSecondary,
    theme.borderColor,
    theme.fontFamily,
    theme.fontScale,
    theme.borderRadius,
    theme.layoutDensity,
    theme.applicationBackgroundUrl,
    theme.customCss,
  ]);
}

export function sanitizeThemeCustomCss(customCss: string | null | undefined) {
  const source = String(customCss || "");
  if (!source.trim()) {
    return "";
  }

  const strippedScripts = source.replace(/<\/?script[^>]*>/gi, "");
  const strippedImports = strippedScripts.replace(/@import\s+[^;]+;/gi, "");
  const strippedExpressions = strippedImports
    .replace(/expression\s*\(/gi, "")
    .replace(/url\s*\(\s*['\"]?\s*javascript:/gi, "url(");

  return strippedExpressions;
}

export function getContrastHint(foreground: string, background: string) {
  const ratio = contrastRatio(foreground, background);
  if (ratio >= 7) return { ratio, level: "AAA" as const };
  if (ratio >= 4.5) return { ratio, level: "AA" as const };
  return { ratio, level: "FAIL" as const };
}
