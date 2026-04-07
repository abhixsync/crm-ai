-- AlterTable
ALTER TABLE "public"."Tenant" ALTER COLUMN "aiAgentName" SET DEFAULT 'Your Advisor',
ALTER COLUMN "loanAssistantHumanAdvisorName" SET DEFAULT 'Our Advisor';

-- AlterTable
ALTER TABLE "public"."TenantTheme" ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "brandTagline" TEXT,
ADD COLUMN     "emailFromName" TEXT;
