-- CreateEnum
CREATE TYPE "public"."CreditTransactionType" AS ENUM ('MONTHLY_GRANT', 'RESERVE', 'SETTLE', 'PURCHASE', 'SUBSCRIPTION_GRANT', 'EXPIRE', 'ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "public"."CreditPool" AS ENUM ('PLAN', 'PURCHASED');

-- CreateEnum
CREATE TYPE "public"."PurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'ACTIVE_RECURRING', 'RENEWAL_FAILED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "public"."CallLog" ADD COLUMN     "creditsCharged" INTEGER,
ADD COLUMN     "creditsReserved" INTEGER,
ADD COLUMN     "reservedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."PlanDefinition" ADD COLUMN     "creditsPerMonth" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."TenantCreditBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planCredits" INTEGER NOT NULL DEFAULT 0,
    "purchasedCredits" INTEGER NOT NULL DEFAULT 0,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "planCreditsAllocated" INTEGER NOT NULL DEFAULT 0,
    "planCreditsUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "planResetAt" TIMESTAMP(3),
    "planResetNextAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CreditTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "public"."CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourcePool" "public"."CreditPool" NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "callLogId" TEXT,
    "packPurchaseId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CreditPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "priceInr" DECIMAL(10,2) NOT NULL,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "billingCycle" "public"."BillingCycle",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stripePriceId" TEXT,
    "razorpayPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CreditPackPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "creditsAtPurchase" INTEGER NOT NULL,
    "priceAtPurchase" DECIMAL(10,2) NOT NULL,
    "amountInr" DECIMAL(10,2),
    "amountUsd" DECIMAL(10,2),
    "billingProvider" "public"."BillingProvider" NOT NULL,
    "providerTxId" TEXT,
    "stripeSubscriptionId" TEXT,
    "razorpaySubscriptionId" TEXT,
    "status" "public"."PurchaseStatus" NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "nextRenewalAt" TIMESTAMP(3),
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPackPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantCreditBalance_tenantId_key" ON "public"."TenantCreditBalance"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key" ON "public"."CreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditTransaction_tenantId_createdAt_idx" ON "public"."CreditTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_callLogId_idx" ON "public"."CreditTransaction"("callLogId");

-- CreateIndex
CREATE INDEX "CreditTransaction_packPurchaseId_idx" ON "public"."CreditTransaction"("packPurchaseId");

-- CreateIndex
CREATE INDEX "CreditTransaction_tenantId_type_idx" ON "public"."CreditTransaction"("tenantId", "type");

-- CreateIndex
CREATE INDEX "CreditPackPurchase_tenantId_status_idx" ON "public"."CreditPackPurchase"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CreditPackPurchase_tenantId_createdAt_idx" ON "public"."CreditPackPurchase"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditPackPurchase_tenantId_expiresAt_idx" ON "public"."CreditPackPurchase"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "CreditPackPurchase_packId_idx" ON "public"."CreditPackPurchase"("packId");

-- AddForeignKey
ALTER TABLE "public"."TenantCreditBalance" ADD CONSTRAINT "TenantCreditBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditTransaction" ADD CONSTRAINT "CreditTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditTransaction" ADD CONSTRAINT "CreditTransaction_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "public"."CallLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditTransaction" ADD CONSTRAINT "CreditTransaction_packPurchaseId_fkey" FOREIGN KEY ("packPurchaseId") REFERENCES "public"."CreditPackPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditPackPurchase" ADD CONSTRAINT "CreditPackPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditPackPurchase" ADD CONSTRAINT "CreditPackPurchase_packId_fkey" FOREIGN KEY ("packId") REFERENCES "public"."CreditPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
