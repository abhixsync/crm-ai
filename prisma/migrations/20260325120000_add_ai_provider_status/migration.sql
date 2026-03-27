-- CreateEnum
CREATE TYPE "AiProviderStatus" AS ENUM ('ACTIVE', 'STANDBY', 'DISABLED');

-- Add status column with a safe default so existing rows get STANDBY
ALTER TABLE "AiProviderConfig" ADD COLUMN "status" "AiProviderStatus" NOT NULL DEFAULT 'STANDBY';

-- Migrate existing data: isActive=true + enabled=true → ACTIVE
UPDATE "AiProviderConfig" SET "status" = 'ACTIVE'   WHERE "isActive" = true  AND "enabled" = true;
-- isActive=false + enabled=true → STANDBY (already the default, included for clarity)
UPDATE "AiProviderConfig" SET "status" = 'STANDBY'  WHERE "isActive" = false AND "enabled" = true;
-- enabled=false → DISABLED regardless of isActive
UPDATE "AiProviderConfig" SET "status" = 'DISABLED' WHERE "enabled" = false;

-- Drop old columns
ALTER TABLE "AiProviderConfig" DROP COLUMN "isActive";
ALTER TABLE "AiProviderConfig" DROP COLUMN "enabled";

-- Update index
DROP INDEX IF EXISTS "AiProviderConfig_tenantId_enabled_isActive_priority_idx";
CREATE INDEX "AiProviderConfig_tenantId_status_priority_idx" ON "AiProviderConfig"("tenantId", "status", "priority");
