import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildPasswordResetEmail } from "@/lib/email/mailer";
import { resolveTenantTheme } from "@/modules/theme/theme.service";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }

    // Find user — silently succeed if not found to avoid email enumeration
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) {
      return Response.json({ ok: true });
    }

    // Cooldown: one email per 2 minutes per user
    const recentToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } },
    });
    if (recentToken) {
      return Response.json({ ok: true }); // silently succeed — don't reveal cooldown
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a new token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    // Resolve tenant theme for branded email (SUPER_ADMIN has no tenantId)
    const theme = user.tenantId ? await resolveTenantTheme(user.tenantId).catch(() => null) : null;
    const emailCtx = {
      brandName:    theme?.emailFromName || theme?.brandName || null,
      primaryColor: theme?.primaryColor  || null,
      fromName:     theme?.emailFromName || theme?.brandName || null,
    };

    const emailPayload = buildPasswordResetEmail(user.name, token, emailCtx);
    sendEmail({ to: email, ...emailPayload, fromName: emailPayload.fromName }).catch((err) =>
      console.error("[forgot-password] Failed to send reset email:", err?.message)
    );

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/forgot-password]", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
