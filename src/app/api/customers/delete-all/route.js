import { prisma } from "@/lib/prisma";
import { getTenantContext, requireSession } from "@/lib/server/auth-guard";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function DELETE() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (auth.session.user.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tenant = getTenantContext(auth.session);
    const tenantId = tenant.tenantId;

    if (!tenantId) {
      return Response.json({ error: "Tenant context required." }, { status: 400 });
    }

    const [
      callResult,
      followUpResult,
      transitionResult,
      campaignJobResult,
      customerResult,
    ] = await prisma.$transaction([
      prisma.callLog.deleteMany({ where: { tenantId } }),
      prisma.followUpTask.deleteMany({ where: { customer: { tenantId } } }),
      prisma.customerTransition.deleteMany({ where: { customer: { tenantId } } }),
      prisma.campaignJob.deleteMany({ where: { customer: { tenantId } } }),
      prisma.customer.deleteMany({ where: { tenantId } }),
    ]);

    return Response.json({
      message: "All customer data deleted.",
      deleted: {
        calls: callResult.count,
        followUps: followUpResult.count,
        transitions: transitionResult.count,
        campaignJobs: campaignJobResult.count,
        customers: customerResult.count,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/customers/delete-all] Database unavailable; returning degraded response.");
      return databaseUnavailableResponse();
    }

    const errorCode =
      error && typeof error === "object" && "code" in error ? String(error.code) : undefined;

    if (errorCode) {
      return Response.json(
        {
          error: "Unable to delete all customer data due to related records.",
          code: errorCode,
        },
        { status: 400 }
      );
    }

    console.error("Delete all customers failed", error);

    return Response.json(
      {
        error: "Unable to delete all customer data.",
      },
      { status: 500 }
    );
  }
}
