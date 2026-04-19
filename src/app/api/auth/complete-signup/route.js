import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.pendingGoogleSignup) {
    return Response.json({ error: "Account already set up." }, { status: 400 });
  }

  try {
    const { company, phone } = await request.json();
    const companyName = String(company || "").trim();
    if (!companyName || companyName.length < 2) {
      return Response.json({ error: "Company name is required (min 2 chars)." }, { status: 400 });
    }

    const userId = session.user.id;

    // Generate unique slug
    let baseSlug = normalizeSlug(companyName);
    if (!baseSlug) baseSlug = "workspace";
    let slug = baseSlug;
    let attempt = 0;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    // Create tenant + activate user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          slug,
          isActive: true,
        },
      });

      // Create trial subscription (30 days PRO)
      const planDef = await tx.planDefinition.findFirst({ where: { plan: "PRO" } });
      const trialEnds = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      if (planDef) {
        await tx.tenantSubscription.create({
          data: {
            tenantId: tenant.id,
            plan: "PRO",
            status: "TRIALING",
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEnds,
            trialEndsAt: trialEnds,
          },
        });
      }

      // Activate user as tenant ADMIN
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          tenantId: tenant.id,
          role: "ADMIN",
          isPrimaryOwner: true,
          isActive: true,
          emailVerified: new Date(),
          ...(phone ? { metadata: { pendingGoogleSignup: false, phone } } : { metadata: { pendingGoogleSignup: false } }),
        },
      });

      return { tenant, user: updatedUser };
    });

    return Response.json({ ok: true, slug: result.tenant.slug });
  } catch (error) {
    console.error("[complete-signup]", error);
    return Response.json({ error: error?.message || "Failed to complete sign-up." }, { status: 500 });
  }
}
