-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SALES');

-- CreateEnum
CREATE TYPE "public"."CustomerStatus" AS ENUM ('NEW', 'CALL_PENDING', 'CALLING', 'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'DO_NOT_CALL', 'CONVERTED', 'CALL_FAILED', 'RETRY_SCHEDULED');

-- CreateEnum
CREATE TYPE "public"."CallDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "public"."CallStatus" AS ENUM ('QUEUED', 'INITIATED', 'ANSWERED', 'NO_ANSWER', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."AiProviderType" AS ENUM ('OPENAI', 'DIALOGFLOW', 'RASA', 'GENERIC_HTTP');

-- CreateEnum
CREATE TYPE "public"."TelephonyProviderType" AS ENUM ('TWILIO', 'VONAGE', 'PLIVO');

-- CreateEnum
CREATE TYPE "public"."CampaignJobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "crmName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantTheme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "secondaryColor" TEXT NOT NULL DEFAULT '#64748b',
    "accentColor" TEXT NOT NULL DEFAULT '#22c55e',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "loginBackgroundUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'SALES',
    "customRoleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoleDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "public"."UserRole" NOT NULL DEFAULT 'SALES',
    "modules" JSONB,
    "permissions" JSONB,
    "featureToggles" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadUpload" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "successRows" INTEGER NOT NULL,
    "failedRows" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "LeadUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "source" TEXT,
    "loanType" TEXT,
    "loanAmount" DOUBLE PRECISION,
    "monthlyIncome" DOUBLE PRECISION,
    "status" "public"."CustomerStatus" NOT NULL DEFAULT 'NEW',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "inActiveCall" BOOLEAN NOT NULL DEFAULT false,
    "nextFollowUpAt" TIMESTAMP(3),
    "manualReview" BOOLEAN NOT NULL DEFAULT false,
    "aiSummary" TEXT,
    "aiIntent" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CallLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerCallId" TEXT,
    "aiProviderUsed" TEXT,
    "telephonyProviderUsed" TEXT,
    "telephonyProviderType" "public"."TelephonyProviderType",
    "direction" "public"."CallDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "public"."CallStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" TEXT NOT NULL DEFAULT 'AI',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "transcript" TEXT,
    "summary" TEXT,
    "intent" TEXT,
    "intentClassification" TEXT,
    "nextAction" TEXT,
    "durationSecs" INTEGER,
    "recordingUrl" TEXT,
    "metadata" JSONB,
    "errorReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserManagementAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserManagementAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerTransition" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromStatus" "public"."CustomerStatus",
    "toStatus" "public"."CustomerStatus" NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AutomationSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."AiProviderConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."AiProviderType" NOT NULL,
    "endpoint" TEXT,
    "apiKey" TEXT,
    "model" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "timeoutMs" INTEGER NOT NULL DEFAULT 12000,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FollowUpTask" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TelephonyProviderConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."TelephonyProviderType" NOT NULL,
    "endpoint" TEXT,
    "apiKey" TEXT,
    "model" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "timeoutMs" INTEGER NOT NULL DEFAULT 12000,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignJob" (
    "id" TEXT NOT NULL,
    "queueJobId" TEXT NOT NULL,
    "customerId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "public"."CampaignJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptsMade" INTEGER NOT NULL DEFAULT 0,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "result" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "public"."Tenant"("slug");

-- CreateIndex
CREATE INDEX "TenantTheme_tenantId_isActive_idx" ON "public"."TenantTheme"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "public"."User"("tenantId");

-- CreateIndex
CREATE INDEX "RoleDefinition_tenantId_active_idx" ON "public"."RoleDefinition"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "RoleDefinition_tenantId_key_key" ON "public"."RoleDefinition"("tenantId", "key");

-- CreateIndex
CREATE INDEX "LeadUpload_tenantId_uploadedAt_idx" ON "public"."LeadUpload"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_status_retryCount_inActiveCall_idx" ON "public"."Customer"("tenantId", "status", "retryCount", "inActiveCall");

-- CreateIndex
CREATE INDEX "Customer_tenantId_nextFollowUpAt_idx" ON "public"."Customer"("tenantId", "nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "public"."Customer"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_providerCallId_key" ON "public"."CallLog"("providerCallId");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_customerId_createdAt_idx" ON "public"."CallLog"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "UserManagementAuditLog_createdAt_idx" ON "public"."UserManagementAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "UserManagementAuditLog_action_createdAt_idx" ON "public"."UserManagementAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "UserManagementAuditLog_targetUserId_createdAt_idx" ON "public"."UserManagementAuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTransition_transitionKey_key" ON "public"."CustomerTransition"("transitionKey");

-- CreateIndex
CREATE INDEX "CustomerTransition_customerId_createdAt_idx" ON "public"."CustomerTransition"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_name_key" ON "public"."AiProviderConfig"("name");

-- CreateIndex
CREATE INDEX "AiProviderConfig_enabled_isActive_priority_idx" ON "public"."AiProviderConfig"("enabled", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyProviderConfig_name_key" ON "public"."TelephonyProviderConfig"("name");

-- CreateIndex
CREATE INDEX "TelephonyProviderConfig_enabled_isActive_priority_idx" ON "public"."TelephonyProviderConfig"("enabled", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignJob_queueJobId_key" ON "public"."CampaignJob"("queueJobId");

-- CreateIndex
CREATE INDEX "CampaignJob_status_createdAt_idx" ON "public"."CampaignJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignJob_customerId_createdAt_idx" ON "public"."CampaignJob"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."TenantTheme" ADD CONSTRAINT "TenantTheme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "public"."RoleDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoleDefinition" ADD CONSTRAINT "RoleDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadUpload" ADD CONSTRAINT "LeadUpload_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeadUpload" ADD CONSTRAINT "LeadUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallLog" ADD CONSTRAINT "CallLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallLog" ADD CONSTRAINT "CallLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserManagementAuditLog" ADD CONSTRAINT "UserManagementAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserManagementAuditLog" ADD CONSTRAINT "UserManagementAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerTransition" ADD CONSTRAINT "CustomerTransition_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FollowUpTask" ADD CONSTRAINT "FollowUpTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FollowUpTask" ADD CONSTRAINT "FollowUpTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignJob" ADD CONSTRAINT "CampaignJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
