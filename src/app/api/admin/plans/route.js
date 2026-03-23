import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/plans
 * Returns all plan definitions. Superadmin only.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const plans = await prisma.planDefinition.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json({ plans });
}
