-- Add tenant-specific callback phone for loan assistant
ALTER TABLE "Tenant" ADD COLUMN "loanAssistantCallbackPhone" TEXT;
