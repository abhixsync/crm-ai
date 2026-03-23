import { NextResponse } from "next/server";
import { runSubscriptionExpiryCron } from "@/lib/subscription/trial-cron";

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
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[/api/cron/subscription-expiry]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
