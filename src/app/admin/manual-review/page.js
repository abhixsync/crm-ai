import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/server/auth-guard";
import { ModernManualReviewView } from "@/components/modern/manual-review-view";

export default async function ManualReviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { tenantId, isSuperAdmin } = getTenantContext(session);
  const filter = isSuperAdmin ? {} : { tenantId };

  const reviews = await prisma.manualReview.findMany({
    where: filter,
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
      callLog:  { select: { id: true, summary: true, intent: true, durationSecs: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return <ModernManualReviewView user={session.user} initialReviews={JSON.parse(JSON.stringify(reviews))} />;
}
