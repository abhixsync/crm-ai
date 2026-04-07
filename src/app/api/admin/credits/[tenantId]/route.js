import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { getCreditBalance } from "@/lib/credits/credit-service";

export async function GET(req, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const balance = await getCreditBalance(params.tenantId);
  return NextResponse.json(balance ?? { available: 0, planCredits: 0, purchasedCredits: 0, reservedCredits: 0 });
}
