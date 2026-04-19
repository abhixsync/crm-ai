import { NextResponse } from "next/server";
import { requireSession, getTenantContext, hasRole } from "@/lib/server/auth-guard";
import { getCreditBalance } from "@/lib/credits/credit-service";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // tenantId can be null in the JWT staleness window after Google OAuth signup
  if (!auth.session.user.tenantId) {
    return NextResponse.json({ available: 0, planCredits: 0, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 0 });
  }
  const { tenantId } = getTenantContext(auth.session, req);
  const balance = await getCreditBalance(tenantId);

  if (!balance) {
    return NextResponse.json({ available: 0, planCredits: 0, purchasedCredits: 0, reservedCredits: 0, planCreditsAllocated: 0 });
  }

  return NextResponse.json(balance);
}
