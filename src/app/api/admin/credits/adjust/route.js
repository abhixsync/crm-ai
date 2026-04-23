import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { adjustCredits } from "@/lib/credits/credit-service";

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId, amount, reason } = await req.json();
  if (!tenantId || amount === undefined || !reason) {
    return NextResponse.json({ error: "tenantId, amount, and reason are required" }, { status: 400 });
  }

  const parsedAmount = Number(amount);
  if (!isFinite(parsedAmount) || isNaN(parsedAmount)) {
    return NextResponse.json({ error: "amount must be a finite number" }, { status: 400 });
  }

  await adjustCredits(tenantId, parsedAmount, reason);
  return NextResponse.json({ success: true });
}
