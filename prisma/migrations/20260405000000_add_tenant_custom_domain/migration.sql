-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "customDomain" TEXT,
ADD COLUMN "customDomainVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "customDomainAddedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_customDomain_key" ON "Tenant"("customDomain");
