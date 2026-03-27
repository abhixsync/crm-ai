-- Catch-up migration: syncs migration history with schema changes applied via db:push.
-- All operations in this file are already applied to the database.
-- This migration is marked applied via: prisma migrate resolve --applied

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('PAID', 'UNPAID', 'VOID');

-- AlterEnum
ALTER TYPE "public"."AiProviderType" ADD VALUE 'GEMINI';

-- AlterEnum
ALTER TYPE "public"."TelephonyProviderType" ADD VALUE 'EXOTEL';

-- DropIndex
DROP INDEX "public"."ConversationSession_sessionKey_key";

-- DropIndex
DROP INDEX "public"."DncRegistry_tenantId_idx";

-- DropIndex
DROP INDEX "public"."SubscriptionInvoice_status_dueDate_idx";

-- DropIndex
DROP INDEX "public"."Tag_tenantId_idx";

-- DropIndex
DROP INDEX "public"."Team_tenantId_idx";

-- DropIndex
DROP INDEX "public"."WebhookLog_event_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."MessageLog" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."SubscriptionInvoice" DROP COLUMN "status",
ADD COLUMN     "status" "public"."InvoiceStatus" NOT NULL;

-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "uiLanguage" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "public"."IntentTrainingPhrase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "intentType" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'hinglish',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntentTrainingPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentTrainingPhrase_tenantId_intentType_idx" ON "public"."IntentTrainingPhrase"("tenantId", "intentType");

-- CreateIndex
CREATE INDEX "IntentTrainingPhrase_tenantId_isActive_idx" ON "public"."IntentTrainingPhrase"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_tenantId_sessionKey_key" ON "public"."ConversationSession"("tenantId", "sessionKey");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_tenantId_status_dueDate_idx" ON "public"."SubscriptionInvoice"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "WebhookLog_tenantId_event_createdAt_idx" ON "public"."WebhookLog"("tenantId", "event", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."IntentTrainingPhrase" ADD CONSTRAINT "IntentTrainingPhrase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
