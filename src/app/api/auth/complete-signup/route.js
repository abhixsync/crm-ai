import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTrialSubscription } from "@/lib/subscription/subscription-service";

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

    // Generate base slug
    let baseSlug = normalizeSlug(companyName);
    if (!baseSlug) baseSlug = "workspace";

    const result = await prisma.$transaction(async (tx) => {
      // DB-level idempotency: re-check pendingGoogleSignup inside transaction
      const freshUser = await tx.user.findUnique({
        where: { id: userId },
        select: { metadata: true, tenantId: true },
      });
      const meta = freshUser?.metadata;
      if (!meta || typeof meta !== "object" || meta.pendingGoogleSignup !== true) {
        throw new Error("ALREADY_SETUP");
      }
      if (freshUser?.tenantId) {
        throw new Error("ALREADY_SETUP");
      }

      // Find a unique slug (inside transaction for safety)
      let slug = baseSlug;
      let attempt = 0;
      while (await tx.tenant.findUnique({ where: { slug } })) {
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      }

      const tenant = await tx.tenant.create({
        data: { name: companyName, slug, isActive: true },
      });

      // Activate user as tenant ADMIN
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          tenantId: tenant.id,
          role: "ADMIN",
          isPrimaryOwner: true,
          isActive: true,
          emailVerified: new Date(),
          metadata: { pendingGoogleSignup: false, ...(phone ? { phone } : {}) },
        },
      });

      return { tenant, user: updatedUser };
    });

    // Create PRO trial subscription + initialize credit balance (outside tx — correct planSnapshot + credits)
    await createTrialSubscription(result.tenant.id);

    return Response.json({ ok: true, slug: result.tenant.slug });
  } catch (error) {
    if (error?.message === "ALREADY_SETUP") {
      return Response.json({ error: "Account already set up." }, { status: 400 });
    }
    console.error("[complete-signup]", error?.message);
    // Don't leak internal error messages to client
    return Response.json({ error: "Failed to complete sign-up. Please try again." }, { status: 500 });
  }
}
