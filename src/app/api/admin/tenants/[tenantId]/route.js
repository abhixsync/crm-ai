import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasRole, requireSession } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureAdminForTenant(payload, tenantId) {
  const existingAdminUserId = String(payload?.existingAdminUserId || "").trim();
  const adminEmail = String(payload?.adminEmail || "").trim().toLowerCase();
  const adminName = String(payload?.adminName || "").trim() || "Tenant Admin";
  const adminPassword = String(payload?.adminPassword || "").trim();

  if (existingAdminUserId) {
    const existingUser = await prisma.user.findUnique({ where: { id: existingAdminUserId } });
    if (!existingUser) {
      throw new Error("existingAdminUserId not found.");
    }

    if (existingUser.role === UserRole.SUPER_ADMIN) {
      throw new Error("SUPER_ADMIN cannot be assigned to a tenant.");
    }

    return prisma.user.update({
      where: { id: existingAdminUserId },
      data: {
        tenantId,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
      },
    });
  }

  if (!adminEmail) {
    return null;
  }

  const userByEmail = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (userByEmail) {
    if (userByEmail.role === UserRole.SUPER_ADMIN) {
      throw new Error("SUPER_ADMIN cannot be assigned to a tenant.");
    }

    return prisma.user.update({
      where: { id: userByEmail.id },
      data: {
        tenantId,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
      },
    });
  }

  if (!adminPassword || adminPassword.length < 6) {
    throw new Error("adminPassword (min 6 chars) is required when creating a new admin user.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  return prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tenantId: true,
    },
  });
}

export async function PATCH(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const routeParams = await params;
    const tenantId = String(routeParams?.tenantId || "").trim();
    if (!tenantId) {
      return Response.json({ error: "Tenant ID is required." }, { status: 400 });
    }

    const payload = await request.json();
    const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!existing) {
      return Response.json({ error: "Tenant not found." }, { status: 404 });
    }

    const nextName =
      payload?.name !== undefined ? String(payload.name || "").trim() : existing.name;
    const nextSlug =
      payload?.slug !== undefined
        ? normalizeSlug(payload.slug)
        : existing.slug;

    if (!nextName) {
      return Response.json({ error: "Tenant name is required." }, { status: 400 });
    }

    if (!nextSlug) {
      return Response.json({ error: "Tenant slug is required." }, { status: 400 });
    }

    if (nextSlug !== existing.slug) {
      const hasConfirmedSlugChange = payload?.confirmSlugChange === true;
      if (!hasConfirmedSlugChange) {
        return Response.json(
          { error: "Slug change requires explicit confirmation." },
          { status: 400 }
        );
      }

      const bySlug = await prisma.tenant.findUnique({ where: { slug: nextSlug } });
      if (bySlug && bySlug.id !== tenantId) {
        return Response.json({ error: "Tenant slug already exists." }, { status: 400 });
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: nextName,
        slug: nextSlug,
        isActive:
          payload?.isActive !== undefined
            ? Boolean(payload.isActive)
            : existing.isActive,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasAdminAssignmentPayload =
      String(payload?.existingAdminUserId || "").trim() ||
      String(payload?.adminEmail || "").trim();

    let adminUser = null;
    if (hasAdminAssignmentPayload) {
      adminUser = await ensureAdminForTenant(payload, tenantId);
    }

    return Response.json({ tenant, adminUser });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/tenants/:tenantId] Database unavailable on patch.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to update tenant." }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const routeParams = await params;
    const tenantId = String(routeParams?.tenantId || "").trim();
    if (!tenantId) {
      return Response.json({ error: "Tenant ID is required." }, { status: 400 });
    }

    const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) {
      return Response.json({ error: "Tenant not found." }, { status: 404 });
    }

    // Delete all tenant data in FK-safe dependency order
    await prisma.$transaction(async (tx) => {
      // 1. Deepest leaf records (depend on CallLog, CreditPackPurchase, Campaign)
      await tx.creditTransaction.deleteMany({ where: { tenantId } });
      await tx.creditPackPurchase.deleteMany({ where: { tenantId } });
      await tx.campaignJob.deleteMany({ where: { tenantId } });

      // 2. Records depending on Customer + CallLog
      await tx.manualReview.deleteMany({ where: { tenantId } });
      await tx.followUpTask.deleteMany({ where: { tenantId } });
      await tx.aiScoringHistory.deleteMany({ where: { tenantId } });
      await tx.customerActivity.deleteMany({ where: { tenantId } });
      await tx.customerTransition.deleteMany({ where: { tenantId } });
      await tx.conversationSession.deleteMany({ where: { tenantId } });

      // 3. CallLog (after all its dependents)
      await tx.callLog.deleteMany({ where: { tenantId } });

      // 4. Records depending on Customer / Deal / Campaign (SetNull refs — safe either way)
      await tx.messageLog.deleteMany({ where: { tenantId } });
      await tx.document.deleteMany({ where: { tenantId } });
      await tx.deal.deleteMany({ where: { tenantId } });

      // 5. Customer (cascades CustomerTag, CustomFieldValue, etc.)
      await tx.customer.deleteMany({ where: { tenantId } });

      // 6. Campaign (CampaignJob already deleted)
      await tx.campaign.deleteMany({ where: { tenantId } });

      // 7. Org / config records
      await tx.tag.deleteMany({ where: { tenantId } });
      await tx.team.deleteMany({ where: { tenantId } }); // cascades TeamMember
      await tx.customFieldDefinition.deleteMany({ where: { tenantId } });
      await tx.webhookLog.deleteMany({ where: { tenantId } });
      await tx.webhookConfig.deleteMany({ where: { tenantId } });
      await tx.dncRegistry.deleteMany({ where: { tenantId } });
      await tx.intentTrainingPhrase.deleteMany({ where: { tenantId } });
      await tx.inAppNotification.deleteMany({ where: { tenantId } });
      await tx.analyticsSnapshot.deleteMany({ where: { tenantId } });
      await tx.userManagementAuditLog.deleteMany({ where: { tenantId } });
      await tx.leadUpload.deleteMany({ where: { tenantId } });
      await tx.aiSystemPrompt.deleteMany({ where: { tenantId } });
      await tx.aiProviderConfig.deleteMany({ where: { tenantId } });
      await tx.telephonyProviderConfig.deleteMany({ where: { tenantId } });
      await tx.automationSetting.deleteMany({ where: { tenantId } });
      await tx.callScheduleConfig.deleteMany({ where: { tenantId } });

      // 8. Subscription & billing
      await tx.usageRecord.deleteMany({ where: { tenantId } });
      await tx.subscriptionInvoice.deleteMany({ where: { tenantId } });
      await tx.tenantSubscription.deleteMany({ where: { tenantId } });
      await tx.tenantCreditBalance.deleteMany({ where: { tenantId } });

      // 9. Theme + invites
      await tx.tenantTheme.deleteMany({ where: { tenantId } });
      await tx.pendingInvite.deleteMany({ where: { tenantId } });

      // 10. Users (PasswordResetToken cascades from User automatically)
      await tx.user.deleteMany({ where: { tenantId } });

      // 10a. Role definitions scoped to this tenant
      await tx.roleDefinition.deleteMany({ where: { tenantId } });

      // 11. Tenant itself
      await tx.tenant.delete({ where: { id: tenantId } });
    }, { timeout: 60_000 });

    return Response.json({ ok: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/tenants/:tenantId] Database unavailable on delete.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to delete tenant." }, { status: 500 });
  }
}
