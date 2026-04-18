import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runSubscriptionExpiryCron } from "@/lib/subscription/trial-cron";
import { verifyDomainCname } from "@/lib/tenant/domain";
import { prisma } from "@/lib/prisma";
import { releaseStaleReserves, expirePurchasedCredits, grantMonthlyCredits } from "@/lib/credits/credit-service";

function cronSecretValid(provided) {
  const expected = process.env.CRON_SECRET;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/cron/subscription-expiry
 *
 * Called daily by an external scheduler (Vercel Cron, cron-job.org, etc.).
 * Secured with CRON_SECRET header.
 */
export async function POST(req) {
  const secret = req.headers.get("x-cron-secret");
  if (!cronSecretValid(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSubscriptionExpiryCron();

    // ─── Domain verification sweep ───────────────────────────────────────────
    try {
      const unverified = await prisma.tenant.findMany({
        where: { customDomain: { not: null }, customDomainVerified: false },
        select: { id: true, customDomain: true },
      });
      for (const t of unverified) {
        const ok = await verifyDomainCname(t.customDomain);
        if (ok) {
          await prisma.tenant.update({ where: { id: t.id }, data: { customDomainVerified: true } });
        }
      }
    } catch (e) {
      console.error("Domain verification sweep error:", e);
    }

    // Release stale reserves (calls that never received a status webhook)
    await releaseStaleReserves().catch((err) =>
      console.error("[cron] releaseStaleReserves failed:", err)
    );

    // Monthly credit grants for all tenants due for reset
    const dueBalances = await prisma.tenantCreditBalance.findMany({
      where: { planResetNextAt: { lte: new Date() } },
      select: { tenantId: true },
    });
    for (const { tenantId } of dueBalances) {
      await grantMonthlyCredits(tenantId).catch((err) =>
        console.error(`[cron] monthly grant failed for ${tenantId}:`, err)
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[/api/cron/subscription-expiry]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
