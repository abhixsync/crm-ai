import { hasRole, requireSession } from "@/lib/server/auth-guard";
import { applyUserBatchAction } from "@/lib/users/user-service";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const result = await applyUserBatchAction(payload, auth.session.user.id);
    return Response.json(result);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/user-management/users/batch] Database unavailable.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to apply batch action." }, { status: 400 });
  }
}
