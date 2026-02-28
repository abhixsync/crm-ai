// 🎨 SYSTEM DEFAULT THEME - HARD FALLBACK
// This ensures UI NEVER breaks, even if database is corrupted or missing
export const SYSTEM_THEME_DEFAULT = {
  // Identity
  id: "system-default",
  tenantId: null,
  isBaseTheme: false,
  themeName: "System Default",

  // 🎨 Core Colors
  primaryColor: "#2563eb",
  secondaryColor: "#64748b",
  accentColor: "#22c55e",
  backgroundColor: "#f8fafc",
  surfaceColor: "#ffffff",
  sidebarColor: "#ffffff",
  headerColor: "#ffffff",

  // 📝 Text Colors
  textPrimary: "#0f172a",
  textSecondary: "#64748b",
  borderColor: "#e2e8f0",

  // ✅ Status Colors
  successColor: "#22c55e",
  warningColor: "#f59e0b",
  errorColor: "#ef4444",
  infoColor: "#3b82f6",

  // 🔤 Typography
  fontFamily: "Inter, system-ui, sans-serif",
  fontScale: "medium",

  // 📐 Layout & Spacing
  borderRadius: "8px",
  buttonRadius: "6px",
  cardRadius: "8px",
  inputRadius: "6px",
  shadowIntensity: "medium",
  layoutDensity: "comfortable",

  // 🧭 Navigation
  sidebarStyle: "default",
  tableStyle: "default",

  // 🌙 Dark Mode
  darkMode: false,

  // 🖼️ Assets (null - will fallback to system assets)
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  applicationBackgroundUrl: null,

  // 🎨 Custom CSS
  customCss: null,

  // 🏷️ Metadata
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as const;

// Type for theme tokens (without database fields)
export type ThemeTokens = Omit<EditableTheme, 'id' | 'createdAt' | 'updatedAt'>;

// Type for editable theme (mutable strings)
export type EditableTheme = {
  id: string;
  tenantId: string | null;
  isBaseTheme: boolean;
  themeName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  sidebarColor: string;
  headerColor: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
  infoColor: string;
  fontFamily: string;
  fontScale: string;
  borderRadius: string;
  buttonRadius: string;
  cardRadius: string;
  inputRadius: string;
  shadowIntensity: string;
  layoutDensity: string;
  sidebarStyle: string;
  tableStyle: string;
  darkMode: boolean;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  applicationBackgroundUrl: string | null;
  customCss: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// Utility to ensure theme has all required fields
export function ensureThemeTokens(theme: Partial<ThemeTokens>): ThemeTokens {
  return {
    ...SYSTEM_THEME_DEFAULT,
    ...theme,
  };
}