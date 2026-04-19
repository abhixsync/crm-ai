import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runSubscriptionExpiryCron } from "@/lib/subscription/trial-cron";
import { verifyDomainCname } from "@/lib/tenant/domain";
import { prisma } from "@/lib/prisma";
import { releaseStaleReserves, expirePurchasedCredits, grantMonthlyCredits } from "@/lib/credits/credit-service";

function cronSecretValid(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  function safeEq(a, b) {
    if (!a || !b) return false;
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }

  const headerSecret = String(req.headers.get("x-cron-secret") || "").trim();
  const authHeader = String(req.headers.get("authorization") || "").trim();
  const bearerSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  return safeEq(headerSecret, expected) || safeEq(bearerSecret, expected);
}

/**
 * POST /api/cron/subscription-expiry
 *
 * Called daily by an external scheduler (Vercel Cron, cron-job.org, etc.).
 * Secured with CRON_SECRET header.
 */
export async function POST(req) {
  if (!cronSecretValid(req)) {
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

    // Release stale inActiveCall locks (customers stuck > 2h with no active call)
    try {
      const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const stuck = await prisma.customer.findMany({
        where: { inActiveCall: true },
        select: {
          id: true,
          callLogs: {
            where: { status: { in: ["INITIATED", "ANSWERED"] }, startedAt: { gte: TWO_HOURS_AGO } },
            select: { id: true },
            take: 1,
          },
        },
      });
      const staleIds = stuck.filter((c) => c.callLogs.length === 0).map((c) => c.id);
      if (staleIds.length > 0) {
        const freed = await prisma.customer.updateMany({
          where: { id: { in: staleIds } },
          data: { inActiveCall: false },
        });
        console.info(`[cron] Released ${freed.count} stale inActiveCall locks`);
      }
    } catch (err) {
      console.error("[cron] releaseStaleCallLocks failed:", err);
    }

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
