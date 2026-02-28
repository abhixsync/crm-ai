/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,isBaseTheme]` on the table `TenantTheme` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."TenantTheme" DROP CONSTRAINT "TenantTheme_tenantId_fkey";

-- DropIndex
DROP INDEX "public"."TenantTheme_tenantId_isActive_idx";

-- AlterTable
ALTER TABLE "public"."TenantTheme" ADD COLUMN     "backgroundColor" TEXT NOT NULL DEFAULT '#f8fafc',
ADD COLUMN     "borderColor" TEXT NOT NULL DEFAULT '#e2e8f0',
ADD COLUMN     "borderRadius" TEXT NOT NULL DEFAULT '8px',
ADD COLUMN     "buttonRadius" TEXT NOT NULL DEFAULT '6px',
ADD COLUMN     "cardRadius" TEXT NOT NULL DEFAULT '8px',
ADD COLUMN     "customCss" TEXT,
ADD COLUMN     "darkMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "errorColor" TEXT NOT NULL DEFAULT '#ef4444',
ADD COLUMN     "fontFamily" TEXT NOT NULL DEFAULT 'Inter, system-ui, sans-serif',
ADD COLUMN     "fontScale" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "headerColor" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "infoColor" TEXT NOT NULL DEFAULT '#3b82f6',
ADD COLUMN     "inputRadius" TEXT NOT NULL DEFAULT '6px',
ADD COLUMN     "isBaseTheme" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "layoutDensity" TEXT NOT NULL DEFAULT 'comfortable',
ADD COLUMN     "shadowIntensity" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "sidebarColor" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "sidebarStyle" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "successColor" TEXT NOT NULL DEFAULT '#22c55e',
ADD COLUMN     "surfaceColor" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "tableStyle" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "textPrimary" TEXT NOT NULL DEFAULT '#0f172a',
ADD COLUMN     "textSecondary" TEXT NOT NULL DEFAULT '#64748b',
ADD COLUMN     "themeName" TEXT NOT NULL DEFAULT 'Default Theme',
ADD COLUMN     "warningColor" TEXT NOT NULL DEFAULT '#f59e0b',
ALTER COLUMN "tenantId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "TenantTheme_tenantId_idx" ON "public"."TenantTheme"("tenantId");

-- CreateIndex
CREATE INDEX "TenantTheme_isBaseTheme_idx" ON "public"."TenantTheme"("isBaseTheme");

-- CreateIndex
CREATE INDEX "TenantTheme_isActive_idx" ON "public"."TenantTheme"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTheme_tenantId_isBaseTheme_key" ON "public"."TenantTheme"("tenantId", "isBaseTheme");

-- AddForeignKey
ALTER TABLE "public"."TenantTheme" ADD CONSTRAINT "TenantTheme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
