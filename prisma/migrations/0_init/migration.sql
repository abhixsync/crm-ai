-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SALES');

-- CreateEnum
CREATE TYPE "public"."CustomerStatus" AS ENUM ('NEW', 'CALL_PENDING', 'CALLING', 'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'DO_NOT_CALL', 'CONVERTED', 'CALL_FAILED', 'RETRY_SCHEDULED');

-- CreateEnum
CREATE TYPE "public"."CallDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "public"."CallStatus" AS ENUM ('QUEUED', 'INITIATED', 'ANSWERED', 'NO_ANSWER', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."CallMode" AS ENUM ('AI', 'HUMAN', 'RECORDED');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "public"."AiProviderType" AS ENUM ('OPENAI', 'CLAUDE', 'GROQ', 'DIALOGFLOW', 'RASA', 'GENERIC_HTTP');

-- CreateEnum
CREATE TYPE "public"."TelephonyProviderType" AS ENUM ('TWILIO', 'VONAGE', 'PLIVO');

-- CreateEnum
CREATE TYPE "public"."CampaignJobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."CampaignType" AS ENUM ('OUTBOUND_CALL', 'SMS_BLAST', 'EMAIL_BLAST', 'MIXED');

-- CreateEnum
CREATE TYPE "public"."DealStage" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "public"."MessageChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "public"."MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('STATUS_CHANGE', 'CAMPAIGN_UPDATE', 'TASK_OVERDUE', 'UPLOAD_COMPLETE', 'REVIEW_FLAGGED', 'DEAL_UPDATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."ReviewResolution" AS ENUM ('INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."DncSource" AS ENUM ('CUSTOMER_REQUEST', 'IMPORT', 'AI_FLAG', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."TeamMemberRole" AS ENUM ('LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."CustomFieldEntityType" AS ENUM ('CUSTOMER', 'DEAL');

-- CreateEnum
CREATE TYPE "public"."CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "public"."ActivityActorType" AS ENUM ('USER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."ActivityType" AS ENUM ('CALL', 'NOTE', 'STATUS_CHANGE', 'TASK', 'EMAIL', 'SMS', 'DEAL_UPDATE', 'DOCUMENT_UPLOAD', 'TAG_ADDED', 'TAG_REMOVED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionPlan" AS ENUM ('FREE', 'PLUS', 'PRO', 'MAX');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "public"."BillingProvider" AS ENUM ('STRIPE', 'RAZORPAY');

-- CreateEnum
CREATE TYPE "public"."SuspendedReason" AS ENUM ('PLAN_DOWNGRADE', 'MANUAL', 'PAYMENT_FAILED', 'ACCOUNT_VIOLATION');

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "crmName" TEXT,
    "aiAgentName" TEXT NOT NULL DEFAULT 'Priya',
    "loanAssistantCompanyName" TEXT,
    "loanAssistantHumanAdvisorName" TEXT NOT NULL DEFAULT 'John Doe',
    "loanAssistantCallbackPhone" TEXT,
    "loanAssistantNotificationEmail" TEXT,
    "loanAssistantLanguage" TEXT NOT NULL DEFAULT 'hinglish',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantTheme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "isBaseTheme" BOOLEAN NOT NULL DEFAULT false,
    "themeName" TEXT NOT NULL DEFAULT 'Default Theme',
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "secondaryColor" TEXT NOT NULL DEFAULT '#64748b',
    "accentColor" TEXT NOT NULL DEFAULT '#22c55e',
    "backgroundColor" TEXT NOT NULL DEFAULT '#f8fafc',
    "surfaceColor" TEXT NOT NULL DEFAULT '#ffffff',
    "sidebarColor" TEXT NOT NULL DEFAULT '#ffffff',
    "headerColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textPrimary" TEXT NOT NULL DEFAULT '#0f172a',
    "textSecondary" TEXT NOT NULL DEFAULT '#64748b',
    "borderColor" TEXT NOT NULL DEFAULT '#e2e8f0',
    "successColor" TEXT NOT NULL DEFAULT '#22c55e',
    "warningColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "errorColor" TEXT NOT NULL DEFAULT '#ef4444',
    "infoColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "fontFamily" TEXT NOT NULL DEFAULT 'Geist, system-ui, sans-serif',
    "fontScale" TEXT NOT NULL DEFAULT 'medium',
    "borderRadius" TEXT NOT NULL DEFAULT '8px',
    "buttonRadius" TEXT NOT NULL DEFAULT '6px',
    "cardRadius" TEXT NOT NULL DEFAULT '12px',
    "inputRadius" TEXT NOT NULL DEFAULT '6px',
    "shadowIntensity" TEXT NOT NULL DEFAULT 'medium',
    "layoutDensity" TEXT NOT NULL DEFAULT 'comfortable',
    "sidebarStyle" TEXT NOT NULL DEFAULT 'default',
    "tableStyle" TEXT NOT NULL DEFAULT 'default',
    "darkMode" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "loginBackgroundUrl" TEXT,
    "applicationBackgroundUrl" TEXT,
    "customCss" TEXT,
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
    "isPrimaryOwner" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" "public"."SuspendedReason",
    "emailVerified" TIMESTAMP(3),
    "emailVerifyToken" TEXT,
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
    "originalName" TEXT,
    "totalRows" INTEGER NOT NULL,
    "successRows" INTEGER NOT NULL,
    "failedRows" INTEGER NOT NULL,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "columnMapping" JSONB,
    "duplicateMode" TEXT NOT NULL DEFAULT 'skip',
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
    "loanAmount" DECIMAL(15,2),
    "monthlyIncome" DECIMAL(15,2),
    "employmentType" TEXT,
    "creditScore" INTEGER,
    "existingLoans" TEXT,
    "status" "public"."CustomerStatus" NOT NULL DEFAULT 'NEW',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "inActiveCall" BOOLEAN NOT NULL DEFAULT false,
    "nextFollowUpAt" TIMESTAMP(3),
    "manualReview" BOOLEAN NOT NULL DEFAULT false,
    "manualReviewReason" TEXT,
    "aiConfidenceScore" DOUBLE PRECISION,
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
    "campaignJobId" TEXT,
    "providerCallId" TEXT,
    "aiProviderUsed" TEXT,
    "telephonyProviderUsed" TEXT,
    "telephonyProviderType" "public"."TelephonyProviderType",
    "direction" "public"."CallDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "public"."CallStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" "public"."CallMode" NOT NULL DEFAULT 'AI',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "transcript" TEXT,
    "summary" TEXT,
    "intent" TEXT,
    "intentClassification" TEXT,
    "nextAction" TEXT,
    "durationSecs" INTEGER,
    "recordingUrl" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "metadata" JSONB,
    "errorReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FollowUpTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "public"."TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerTransition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromStatus" "public"."CustomerStatus",
    "toStatus" "public"."CustomerStatus" NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "aiConfidence" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ManualReview" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callLogId" TEXT,
    "reason" TEXT NOT NULL,
    "aiSummary" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "transcript" TEXT,
    "resolution" "public"."ReviewResolution",
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InAppNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "outboundCalls" INTEGER NOT NULL DEFAULT 0,
    "inboundCalls" INTEGER NOT NULL DEFAULT 0,
    "answeredCalls" INTEGER NOT NULL DEFAULT 0,
    "completedCalls" INTEGER NOT NULL DEFAULT 0,
    "failedCalls" INTEGER NOT NULL DEFAULT 0,
    "noAnswerCalls" INTEGER NOT NULL DEFAULT 0,
    "skippedJobs" INTEGER NOT NULL DEFAULT 0,
    "interestedCount" INTEGER NOT NULL DEFAULT 0,
    "convertedCount" INTEGER NOT NULL DEFAULT 0,
    "avgDurationSecs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newLeads" INTEGER NOT NULL DEFAULT 0,
    "dealsWon" INTEGER NOT NULL DEFAULT 0,
    "dealsLost" INTEGER NOT NULL DEFAULT 0,
    "dealValueWon" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AutomationSetting" (
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSetting_pkey" PRIMARY KEY ("tenantId","key")
);

-- CreateTable
CREATE TABLE "public"."AiProviderConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
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
CREATE TABLE "public"."AiSystemPrompt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL DEFAULT 'default',
    "label" TEXT NOT NULL DEFAULT 'Default System Prompt',
    "prompt" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSystemPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TelephonyProviderConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
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
CREATE TABLE "public"."Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "public"."CampaignType" NOT NULL DEFAULT 'OUTBOUND_CALL',
    "aiPromptId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "queueJobId" TEXT NOT NULL,
    "customerId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "public"."CampaignJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptsMade" INTEGER NOT NULL DEFAULT 0,
    "skipReason" TEXT,
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

-- CreateTable
CREATE TABLE "public"."Deal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DECIMAL(15,2),
    "stage" "public"."DealStage" NOT NULL DEFAULT 'NEW',
    "probability" INTEGER,
    "loanType" TEXT,
    "loanAmount" DECIMAL(15,2),
    "closedAt" TIMESTAMP(3),
    "expectedCloseDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "summary" TEXT,
    "context" JSONB,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "lastCallId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DncRegistry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "source" "public"."DncSource",
    "addedById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DncRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."TeamMemberRole",
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "public"."Tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerTag" (
    "customerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("customerId","tagId")
);

-- CreateTable
CREATE TABLE "public"."CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "public"."CustomFieldEntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "public"."CustomFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerCustomField" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiScoringHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "previousScore" DOUBLE PRECISION,
    "model" TEXT,
    "reason" TEXT,
    "callLogId" TEXT,
    "scoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiScoringHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "public"."ActivityActorType" NOT NULL,
    "type" "public"."ActivityType" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "public"."MessageChannel" NOT NULL,
    "direction" "public"."CallDirection" NOT NULL,
    "status" "public"."MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "content" TEXT NOT NULL,
    "subject" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT NOT NULL,
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "dealId" TEXT,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSizeBytes" BIGINT,
    "uploadedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CallScheduleConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "callWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "callWindowEnd" TEXT NOT NULL DEFAULT '18:00',
    "allowedDays" INTEGER[],
    "maxCallsPerDay" INTEGER NOT NULL DEFAULT 200,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "minCallGapMins" INTEGER NOT NULL DEFAULT 30,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallScheduleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "success" BOOLEAN NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserManagementAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "tenantId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserManagementAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanDefinition" (
    "id" TEXT NOT NULL,
    "plan" "public"."SubscriptionPlan" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "annualPriceUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monthlyPriceInr" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "annualPriceInr" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "annualDiscountPct" INTEGER NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 1,
    "maxCustomers" INTEGER NOT NULL DEFAULT 100,
    "maxAiCallsPerMonth" INTEGER NOT NULL DEFAULT 0,
    "maxLeadUploadsPerMonth" INTEGER NOT NULL DEFAULT 1,
    "maxWebhooks" INTEGER NOT NULL DEFAULT 0,
    "maxCustomFields" INTEGER NOT NULL DEFAULT 0,
    "maxTeams" INTEGER NOT NULL DEFAULT 0,
    "maxStorageMb" INTEGER NOT NULL DEFAULT 0,
    "hasAiCalling" BOOLEAN NOT NULL DEFAULT false,
    "hasAdvancedAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "hasManualReview" BOOLEAN NOT NULL DEFAULT false,
    "hasDncRegistry" BOOLEAN NOT NULL DEFAULT false,
    "hasTeams" BOOLEAN NOT NULL DEFAULT false,
    "hasMultiChannel" BOOLEAN NOT NULL DEFAULT false,
    "hasDealPipeline" BOOLEAN NOT NULL DEFAULT false,
    "hasIntentTraining" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomAiPrompts" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomProviders" BOOLEAN NOT NULL DEFAULT false,
    "hasWhiteLabel" BOOLEAN NOT NULL DEFAULT false,
    "hasApiAccess" BOOLEAN NOT NULL DEFAULT false,
    "hasAiCallDemo" BOOLEAN NOT NULL DEFAULT false,
    "hasDocuments" BOOLEAN NOT NULL DEFAULT false,
    "hasConversationMemory" BOOLEAN NOT NULL DEFAULT false,
    "hasWebhooks" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomFields" BOOLEAN NOT NULL DEFAULT false,
    "hasCampaigns" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "public"."SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "billingCycle" "public"."BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "billingProvider" "public"."BillingProvider",
    "planDefinitionId" TEXT,
    "trialStartAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "razorpayCustomerId" TEXT,
    "razorpaySubscriptionId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "gracePeriodEndsAt" TIMESTAMP(3),
    "planSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountUsd" DECIMAL(10,2),
    "amountInr" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "billingProvider" "public"."BillingProvider" NOT NULL,
    "externalInvoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UsageRecord" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "aiCallsUsed" INTEGER NOT NULL DEFAULT 0,
    "leadsUploaded" INTEGER NOT NULL DEFAULT 0,
    "storageUsedMb" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "public"."Tenant"("slug");

-- CreateIndex
CREATE INDEX "TenantTheme_tenantId_isBaseTheme_isActive_idx" ON "public"."TenantTheme"("tenantId", "isBaseTheme", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerifyToken_key" ON "public"."User"("emailVerifyToken");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "public"."User"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_isSuspended_idx" ON "public"."User"("tenantId", "isSuspended");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "public"."User"("tenantId", "email");

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
CREATE INDEX "Customer_tenantId_manualReview_idx" ON "public"."Customer"("tenantId", "manualReview");

-- CreateIndex
CREATE INDEX "Customer_tenantId_assignedToId_status_idx" ON "public"."Customer"("tenantId", "assignedToId", "status");

-- CreateIndex
CREATE INDEX "Customer_tenantId_archivedAt_idx" ON "public"."Customer"("tenantId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "public"."Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_customerId_createdAt_idx" ON "public"."CallLog"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_direction_status_idx" ON "public"."CallLog"("tenantId", "direction", "status");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_createdAt_idx" ON "public"."CallLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLog_tenantId_status_startedAt_idx" ON "public"."CallLog"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_tenantId_providerCallId_key" ON "public"."CallLog"("tenantId", "providerCallId");

-- CreateIndex
CREATE INDEX "FollowUpTask_tenantId_assignedToId_status_dueDate_idx" ON "public"."FollowUpTask"("tenantId", "assignedToId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "FollowUpTask_customerId_status_idx" ON "public"."FollowUpTask"("customerId", "status");

-- CreateIndex
CREATE INDEX "FollowUpTask_tenantId_dueDate_status_idx" ON "public"."FollowUpTask"("tenantId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "CustomerTransition_customerId_createdAt_idx" ON "public"."CustomerTransition"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerTransition_tenantId_toStatus_createdAt_idx" ON "public"."CustomerTransition"("tenantId", "toStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTransition_tenantId_transitionKey_key" ON "public"."CustomerTransition"("tenantId", "transitionKey");

-- CreateIndex
CREATE INDEX "ManualReview_tenantId_resolution_createdAt_idx" ON "public"."ManualReview"("tenantId", "resolution", "createdAt");

-- CreateIndex
CREATE INDEX "ManualReview_tenantId_confidenceScore_idx" ON "public"."ManualReview"("tenantId", "confidenceScore");

-- CreateIndex
CREATE INDEX "ManualReview_tenantId_customerId_createdAt_idx" ON "public"."ManualReview"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "InAppNotification_tenantId_userId_isRead_createdAt_idx" ON "public"."InAppNotification"("tenantId", "userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "InAppNotification_tenantId_type_createdAt_idx" ON "public"."InAppNotification"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_tenantId_date_key" ON "public"."AnalyticsSnapshot"("tenantId", "date");

-- CreateIndex
CREATE INDEX "AiProviderConfig_tenantId_enabled_isActive_priority_idx" ON "public"."AiProviderConfig"("tenantId", "enabled", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_tenantId_name_key" ON "public"."AiProviderConfig"("tenantId", "name");

-- CreateIndex
CREATE INDEX "AiSystemPrompt_tenantId_isActive_idx" ON "public"."AiSystemPrompt"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AiSystemPrompt_tenantId_key_key" ON "public"."AiSystemPrompt"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TelephonyProviderConfig_tenantId_enabled_isActive_priority_idx" ON "public"."TelephonyProviderConfig"("tenantId", "enabled", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyProviderConfig_tenantId_name_key" ON "public"."TelephonyProviderConfig"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_status_scheduledAt_idx" ON "public"."Campaign"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_createdAt_idx" ON "public"."Campaign"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignJob_tenantId_status_createdAt_idx" ON "public"."CampaignJob"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignJob_customerId_createdAt_idx" ON "public"."CampaignJob"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignJob_campaignId_status_idx" ON "public"."CampaignJob"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignJob_tenantId_queueJobId_key" ON "public"."CampaignJob"("tenantId", "queueJobId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_stage_createdAt_idx" ON "public"."Deal"("tenantId", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_tenantId_assignedToId_stage_idx" ON "public"."Deal"("tenantId", "assignedToId", "stage");

-- CreateIndex
CREATE INDEX "Deal_customerId_idx" ON "public"."Deal"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_sessionKey_key" ON "public"."ConversationSession"("sessionKey");

-- CreateIndex
CREATE INDEX "ConversationSession_tenantId_customerId_expiresAt_idx" ON "public"."ConversationSession"("tenantId", "customerId", "expiresAt");

-- CreateIndex
CREATE INDEX "ConversationSession_tenantId_updatedAt_idx" ON "public"."ConversationSession"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "DncRegistry_tenantId_idx" ON "public"."DncRegistry"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DncRegistry_tenantId_phone_key" ON "public"."DncRegistry"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Team_tenantId_idx" ON "public"."Team"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_tenantId_name_key" ON "public"."Team"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "public"."Tag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "public"."Tag"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenantId_entityType_idx" ON "public"."CustomFieldDefinition"("tenantId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_entityType_key_key" ON "public"."CustomFieldDefinition"("tenantId", "entityType", "key");

-- CreateIndex
CREATE INDEX "CustomerCustomField_fieldId_idx" ON "public"."CustomerCustomField"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCustomField_customerId_fieldId_key" ON "public"."CustomerCustomField"("customerId", "fieldId");

-- CreateIndex
CREATE INDEX "AiScoringHistory_customerId_createdAt_idx" ON "public"."AiScoringHistory"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "AiScoringHistory_tenantId_createdAt_idx" ON "public"."AiScoringHistory"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerActivity_tenantId_customerId_createdAt_idx" ON "public"."CustomerActivity"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerActivity_tenantId_type_createdAt_idx" ON "public"."CustomerActivity"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_tenantId_customerId_createdAt_idx" ON "public"."MessageLog"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_tenantId_channel_status_idx" ON "public"."MessageLog"("tenantId", "channel", "status");

-- CreateIndex
CREATE INDEX "MessageLog_tenantId_status_sentAt_idx" ON "public"."MessageLog"("tenantId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "Document_tenantId_customerId_idx" ON "public"."Document"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Document_tenantId_dealId_idx" ON "public"."Document"("tenantId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "CallScheduleConfig_tenantId_key" ON "public"."CallScheduleConfig"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookConfig_tenantId_enabled_idx" ON "public"."WebhookConfig"("tenantId", "enabled");

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_createdAt_idx" ON "public"."WebhookLog"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_success_createdAt_idx" ON "public"."WebhookLog"("webhookId", "success", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_event_createdAt_idx" ON "public"."WebhookLog"("event", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_tenantId_success_createdAt_idx" ON "public"."WebhookLog"("tenantId", "success", "createdAt");

-- CreateIndex
CREATE INDEX "UserManagementAuditLog_createdAt_idx" ON "public"."UserManagementAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "UserManagementAuditLog_action_createdAt_idx" ON "public"."UserManagementAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "UserManagementAuditLog_targetUserId_createdAt_idx" ON "public"."UserManagementAuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserManagementAuditLog_tenantId_createdAt_idx" ON "public"."UserManagementAuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDefinition_plan_key" ON "public"."PlanDefinition"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "public"."TenantSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSubscription_status_trialEndsAt_idx" ON "public"."TenantSubscription"("status", "trialEndsAt");

-- CreateIndex
CREATE INDEX "TenantSubscription_status_currentPeriodEnd_idx" ON "public"."TenantSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "TenantSubscription_status_gracePeriodEndsAt_idx" ON "public"."TenantSubscription"("status", "gracePeriodEndsAt");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_tenantId_createdAt_idx" ON "public"."SubscriptionInvoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_subscriptionId_createdAt_idx" ON "public"."SubscriptionInvoice"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_status_dueDate_idx" ON "public"."SubscriptionInvoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_month_idx" ON "public"."UsageRecord"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_subscriptionId_month_key" ON "public"."UsageRecord"("subscriptionId", "month");

-- AddForeignKey
ALTER TABLE "public"."TenantTheme" ADD CONSTRAINT "TenantTheme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "public"."CallLog" ADD CONSTRAINT "CallLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallLog" ADD CONSTRAINT "CallLog_campaignJobId_fkey" FOREIGN KEY ("campaignJobId") REFERENCES "public"."CampaignJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FollowUpTask" ADD CONSTRAINT "FollowUpTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FollowUpTask" ADD CONSTRAINT "FollowUpTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FollowUpTask" ADD CONSTRAINT "FollowUpTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FollowUpTask" ADD CONSTRAINT "FollowUpTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerTransition" ADD CONSTRAINT "CustomerTransition_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualReview" ADD CONSTRAINT "ManualReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualReview" ADD CONSTRAINT "ManualReview_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "public"."CallLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualReview" ADD CONSTRAINT "ManualReview_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InAppNotification" ADD CONSTRAINT "InAppNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutomationSetting" ADD CONSTRAINT "AutomationSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiProviderConfig" ADD CONSTRAINT "AiProviderConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiSystemPrompt" ADD CONSTRAINT "AiSystemPrompt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TelephonyProviderConfig" ADD CONSTRAINT "TelephonyProviderConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_aiPromptId_fkey" FOREIGN KEY ("aiPromptId") REFERENCES "public"."AiSystemPrompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignJob" ADD CONSTRAINT "CampaignJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignJob" ADD CONSTRAINT "CampaignJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationSession" ADD CONSTRAINT "ConversationSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationSession" ADD CONSTRAINT "ConversationSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationSession" ADD CONSTRAINT "ConversationSession_lastCallId_fkey" FOREIGN KEY ("lastCallId") REFERENCES "public"."CallLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DncRegistry" ADD CONSTRAINT "DncRegistry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DncRegistry" ADD CONSTRAINT "DncRegistry_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerTag" ADD CONSTRAINT "CustomerTag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerTag" ADD CONSTRAINT "CustomerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerCustomField" ADD CONSTRAINT "CustomerCustomField_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerCustomField" ADD CONSTRAINT "CustomerCustomField_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "public"."CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiScoringHistory" ADD CONSTRAINT "AiScoringHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiScoringHistory" ADD CONSTRAINT "AiScoringHistory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiScoringHistory" ADD CONSTRAINT "AiScoringHistory_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "public"."CallLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiScoringHistory" ADD CONSTRAINT "AiScoringHistory_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerActivity" ADD CONSTRAINT "CustomerActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerActivity" ADD CONSTRAINT "CustomerActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerActivity" ADD CONSTRAINT "CustomerActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageLog" ADD CONSTRAINT "MessageLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageLog" ADD CONSTRAINT "MessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "public"."Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallScheduleConfig" ADD CONSTRAINT "CallScheduleConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookConfig" ADD CONSTRAINT "WebhookConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookConfig" ADD CONSTRAINT "WebhookConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookLog" ADD CONSTRAINT "WebhookLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookLog" ADD CONSTRAINT "WebhookLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "public"."WebhookConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserManagementAuditLog" ADD CONSTRAINT "UserManagementAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserManagementAuditLog" ADD CONSTRAINT "UserManagementAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantSubscription" ADD CONSTRAINT "TenantSubscription_planDefinitionId_fkey" FOREIGN KEY ("planDefinitionId") REFERENCES "public"."PlanDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."TenantSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UsageRecord" ADD CONSTRAINT "UsageRecord_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."TenantSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
