import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, hasRole, getTenantContext } from "@/lib/server/auth-guard";
import { sendEmail, buildTeamInviteEmail } from "@/lib/email/mailer";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

const ALLOWED_ROLES = ["ADMIN", "SALES"];

export async function POST(request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session, ["ADMIN", "SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const role = String(body?.role || "").trim().toUpperCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Role must be one of: ${ALLOWED_ROLES.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const { tenantId } = getTenantContext(auth.session, request);

    if (!tenantId) {
      return NextResponse.json({ error: "A tenant must be selected to send invites." }, { status: 400 });
    }

    // Check if user already exists in this tenant
    const existingUser = await prisma.user.findFirst({
      where: { email, tenantId },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json({ error: "User already exists in this workspace." }, { status: 400 });
    }

    // Delete any existing non-accepted invite for this email + tenant (re-invite)
    await prisma.pendingInvite.deleteMany({
      where: { email, tenantId, acceptedAt: null },
    });

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invite = await prisma.pendingInvite.create({
      data: {
        tenantId,
        email,
        role,
        token,
        invitedById: auth.session.user.id,
        expiresAt,
      },
    });

    // Resolve tenant info for the email
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    let emailCtx = { brandName: null, primaryColor: null, fromName: null };
    try {
      const theme = await resolveTenantTheme(tenantId);
      emailCtx = {
        brandName: theme?.brandName || null,
        primaryColor: theme?.primaryColor || null,
        fromName: theme?.brandName || null,
      };
    } catch {
      // non-fatal — use defaults
    }

    const inviterName = auth.session.user.name || auth.session.user.email || "Your team lead";
    const tenantName = tenant?.name || "your workspace";

    const emailContent = buildTeamInviteEmail(
      null,
      inviterName,
      tenantName,
      role,
      token,
      emailCtx
    );

    await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      fromName: emailContent.fromName,
    });

    return NextResponse.json(
      {
        ok: true,
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/admin/user-management/invite] Error:", error?.message);
    return NextResponse.json({ error: "Unable to send invite. Please try again." }, { status: 500 });
  }
}
