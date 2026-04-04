import { NextResponse } from "next/server";
import { runSubscriptionExpiryCron } from "@/lib/subscription/trial-cron";
import { verifyDomainCname } from "@/lib/tenant/domain";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/cron/subscription-expiry
 *
 * Called daily by an external scheduler (Vercel Cron, cron-job.org, etc.).
 * Secured with CRON_SECRET header.
 */
export async function POST(req) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
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

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[/api/cron/subscription-expiry]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
