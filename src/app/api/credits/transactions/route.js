import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { getCreditTransactions } from "@/lib/credits/credit-service";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = getTenantContext(auth.session, req);
  const { searchParams } = new URL(req.url);
  const page  = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const type  = searchParams.get("type") || undefined;

  const result = await getCreditTransactions(tenantId, { page, limit, type });
  return NextResponse.json(result);
}
