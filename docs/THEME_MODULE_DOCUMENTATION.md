# Theme Module Documentation

## 1) Purpose and scope

The theme module provides multi-tenant appearance customization with three-level inheritance:

1. **System defaults** (hardcoded fallback)
2. **Platform base theme** (global DB-managed defaults)
3. **Tenant override theme** (tenant-specific customizations)

It supports:

- Runtime theme resolution per tenant
- Optimistic client-side theme preview/update
- Asset uploads (logo, favicon, login/app backgrounds)
- Theme reset to inherited defaults
- Caching (memory + optional Redis)


## 2) Data model

### `TenantTheme` table

Defined in [prisma/schema.prisma](../prisma/schema.prisma), model `TenantTheme`.

Key fields:

- `tenantId: String?` (`NULL` for base theme)
- `isBaseTheme: Boolean`
- Token fields for colors, typography, spacing, layout, status colors
- Asset URLs: `logoUrl`, `faviconUrl`, `loginBackgroundUrl`, `applicationBackgroundUrl`
- `customCss`, `isActive`, timestamps

Important constraints:

- `@@unique([tenantId, isBaseTheme])` ensures one active logical record type per tenant/base dimension.
- Base theme is represented as `tenantId = NULL`, `isBaseTheme = true`.

Migration that introduced/enhanced this model is in [prisma/migrations/20260228124817_enhance_theme_system/migration.sql](../prisma/migrations/20260228124817_enhance_theme_system/migration.sql).


## 3) Core architecture

### 3.1 System defaults

Source of truth for guaranteed fallback tokens:

- [src/core/theme/system-defaults.ts](../src/core/theme/system-defaults.ts)

Exports:

- `SYSTEM_THEME_DEFAULT`
- `EditableTheme` / `ThemeTokens` types
- `ensureThemeTokens(...)`

### 3.2 Theme service (domain logic)

Main orchestration lives in:

- [src/modules/theme/theme.service.ts](../src/modules/theme/theme.service.ts)

Key functions:

- `resolveTenantTheme(tenantId)` → resolves effective theme via inheritance
- `updateTenantTheme(tenantId, payload, isBaseTheme)` → upsert/update base or tenant theme
- `resetTenantTheme(tenantId)` → deactivates tenant override so inheritance applies
- `hasTenantCustomTheme(tenantId)` / `getTenantThemeStatus(tenantId)`
- `uploadThemeAsset(tenantId, file)`
- `invalidateThemeCache(tenantId)`

### 3.3 Controller layer (access policy + request semantics)

- [src/modules/theme/theme.controller.ts](../src/modules/theme/theme.controller.ts)

Responsibilities:

- Role checks (`ADMIN`/`SUPER_ADMIN` for writes)
- Tenant scoping via `resolveTenantContext` + `assertTenantMatch`
- Distinguish base-theme updates (`isBaseTheme`) vs tenant updates
- Convert `assetKey` into concrete theme fields

### 3.4 API routes

Theme endpoints:

- Authenticated runtime theme:
  - `GET /api/theme/active` → [src/app/api/theme/active/route.ts](../src/app/api/theme/active/route.ts)
- Public minimal theme (login/favicon contexts):
  - `GET /api/theme/public` → [src/app/api/theme/public/route.ts](../src/app/api/theme/public/route.ts)
- Tenant reset:
  - `POST /api/theme/reset` → [src/app/api/theme/reset/route.ts](../src/app/api/theme/reset/route.ts)
- Tenant status:
  - `GET /api/theme/status` → [src/app/api/theme/status/route.ts](../src/app/api/theme/status/route.ts)

Admin mutation endpoints:

- `PUT /api/admin/theme` → [src/app/api/admin/theme/route.ts](../src/app/api/admin/theme/route.ts)
- `POST /api/admin/theme/assets` → [src/app/api/admin/theme/assets/route.ts](../src/app/api/admin/theme/assets/route.ts)


## 4) Inheritance model (effective theme resolution)

Resolution order in `resolveTenantTheme(...)`:

1. Start with mutable copy of system defaults
2. Merge active base theme (if exists)
3. Merge tenant override (if exists)
4. Compute metadata:
   - `source: "default" | "base" | "tenant"`
   - `updatedAt` from tenant override or base theme

Tests for inheritance behavior:

- [src/modules/theme/__tests__/theme.inheritance.test.ts](../src/modules/theme/__tests__/theme.inheritance.test.ts)

Covered behaviors include:

- default fallback when no records exist
- base theme inheritance
- tenant override precedence
- partial merge behavior
- reset behavior
- cache invalidation expectations


## 5) Caching strategy

In [src/modules/theme/theme.service.ts](../src/modules/theme/theme.service.ts):

- In-memory cache: `Map<string, { value, expiresAt }>`
- TTL: 10 minutes (`CACHE_TTL_MS`)
- Optional Redis cache via `ioredis`
- Redis can be disabled in dev with `DISABLE_REDIS=true`

Cache invalidation:

- Tenant update: invalidate that tenant key
- Base update: clear all theme keys (memory + Redis key pattern)


## 6) Client runtime usage

### 6.1 Provider and context

- [src/core/theme/ThemeProvider.tsx](../src/core/theme/ThemeProvider.tsx)
- [src/core/theme/useTheme.ts](../src/core/theme/useTheme.ts)

Flow:

- On session-ready, provider fetches `/api/theme/active` (tenant-aware)
- Applies CSS variables on `:root`
- Exposes:
  - `theme`
  - `loadingTheme`
  - `refreshTheme()`
  - `setThemeOptimistic(patch)`

### 6.2 App wiring

Provider mounted in root layout:

- [src/app/layout.js](../src/app/layout.js)

`ThemeAssets` is also mounted globally:

- [src/components/theme/theme-assets.js](../src/components/theme/theme-assets.js)

Responsibilities:

- Apply favicon from active theme; fallback to `/api/theme/public`
- Update `document.title` using tenant settings endpoint

### 6.3 CSS token bridge

Global token defaults and utility-bridge rules:

- [src/app/globals.css](../src/app/globals.css)

Examples:

- `--color-primary`, `--color-secondary`, `--color-accent`
- mapped utility overrides for legacy `text-slate-*`, `bg-white*`, `border-slate-*`

### 6.4 Component-level usage examples

- `Button` uses CSS vars for variants:
  - [src/components/ui/button.js](../src/components/ui/button.js)
- Dashboard tenant logo from theme:
  - [src/components/crm/dashboard-client.js](../src/components/crm/dashboard-client.js)
- Login page public theming (`/api/theme/public`):
  - [src/app/login/page.js](../src/app/login/page.js)


## 7) Admin UX flows

### 7.1 Tenant Theme Settings (`ADMIN` + `SUPER_ADMIN`)

- UI: [src/modules/admin/theme/ThemeSettingsPage.tsx](../src/modules/admin/theme/ThemeSettingsPage.tsx)
- Surface: inside settings tabs at [src/components/admin/settings-tabs.js](../src/components/admin/settings-tabs.js)

Capabilities:

- Select tenant (super admin)
- Edit primary/secondary/accent tokens
- Upload/clear logo/favicon/login/application assets
- View theme status (`custom` vs `inherits`) via `/api/theme/status`
- Reset tenant overrides via `/api/theme/reset`
- Optimistic UI updates with `setThemeOptimistic`

### 7.2 Global Appearance (`SUPER_ADMIN` only)

- Page route: [src/app/admin/global-appearance/page.tsx](../src/app/admin/global-appearance/page.tsx)
- UI module: [src/modules/admin/global-appearance/GlobalAppearancePage.tsx](../src/modules/admin/global-appearance/GlobalAppearancePage.tsx)

Capabilities:

- Manage base/platform theme colors and typography
- Upload base assets (logo/favicon)
- Writes use `isBaseTheme: true`


## 8) Asset lifecycle

Upload path in service:

- [src/modules/theme/theme.service.ts](../src/modules/theme/theme.service.ts)

Storage convention:

- Physical files: `public/uploads/themes/<tenantId|global>/<timestamped_name>`
- URL returned: `/uploads/themes/<tenantId|global>/<file>`

Controller maps upload keys to theme fields:

- `logo` -> `logoUrl`
- `favicon` -> `faviconUrl`
- `loginBackground` -> `loginBackgroundUrl`
- `applicationBackground` -> `applicationBackgroundUrl`


## 9) Default assets tooling

Scripts:

- Generate PNG defaults:
  - [scripts/generate-default-theme-pngs.ps1](../scripts/generate-default-theme-pngs.ps1)
- Apply defaults to base theme and clear tenant asset overrides:
  - [scripts/apply-default-theme-assets.cjs](../scripts/apply-default-theme-assets.cjs)
- NPM scripts in [package.json](../package.json):
  - `theme:assets:generate`
  - `theme:assets:apply`
  - `theme:assets:defaults`

Operational deployment notes:

- [docs/THEME_DB_DEPLOY.md](./THEME_DB_DEPLOY.md)


## 10) Security and tenancy boundaries

Tenant and role guardrails:

- Role helpers: [src/lib/server/auth-guard.js](../src/lib/server/auth-guard.js)
- Tenant resolution/assertion: [src/middleware/tenant.middleware.ts](../src/middleware/tenant.middleware.ts)

Effective rules:

- `SUPER_ADMIN` can manage base theme and target arbitrary tenants
- `ADMIN` can manage only their tenant
- `SALES` has read-only behavior and cannot write theme updates


## 11) Known caveats / technical notes

1. **Cache key handling in `theme.service.ts` should be reviewed.**
   - `resolveTenantTheme` computes a cache key, then passes it into helpers (`readCache`, `writeCache`) that also compute keys, which may lead to double-prefix keys and imperfect invalidation symmetry.
   - Functional impact depends on runtime path, but this is a good candidate for cleanup to prevent stale reads.

2. **Legacy utility bridge in `globals.css` is intentionally broad.**
   - It helps legacy screens adopt theme tokens quickly, but can override some utility class expectations.

3. **Theme public endpoint intentionally returns a reduced field set.**
   - This keeps login/public consumption minimal and decoupled from full private theme payload.


## 12) Testing coverage

Primary tests:

- Theme inheritance and reset behavior:
  - [src/modules/theme/__tests__/theme.inheritance.test.ts](../src/modules/theme/__tests__/theme.inheritance.test.ts)
- Controller/service smoke tests:
  - [src/modules/theme/__tests__/theme.controller.test.ts](../src/modules/theme/__tests__/theme.controller.test.ts)
- Responsive asset selector utility:
  - [src/core/theme/__tests__/useThemeAsset.test.ts](../src/core/theme/__tests__/useThemeAsset.test.ts)


## 13) End-to-end request/update examples

### Read active theme for current tenant

1. Client `ThemeProvider` calls `GET /api/theme/active`
2. Route validates session and delegates to controller
3. Controller resolves tenant context and calls `resolveTenantTheme`
4. Service merges defaults/base/tenant + caches result
5. Client receives theme and applies CSS variables

### Update tenant accent color

1. Theme Settings UI sends `PUT /api/admin/theme` with `{ tenantId, accentColor }`
2. Controller enforces role/tenant authorization
3. Service upserts tenant theme override record
4. Service invalidates tenant cache
5. UI applies optimistic patch then refreshes active theme

### Reset tenant theme to inherited defaults

1. UI calls `POST /api/theme/reset?tenantId=<id>`
2. Controller validates role/tenant permissions
3. Service deactivates tenant override (`isActive=false`)
4. Next read resolves from base theme (or system default if no base)


## 14) Developer reference demo

For a compact implementation reference of tokenized UI elements, use:

- [src/modules/theme/ThemeDeveloperReference.tsx](../src/modules/theme/ThemeDeveloperReference.tsx)

This demo includes:

- themed card
- themed button
- themed table snippet with selected-row state
- light/dark preview toggle
