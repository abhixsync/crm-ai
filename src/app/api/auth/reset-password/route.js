import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
  try {
    const body = await request.json();
    const token    = String(body.token    || "").trim();
    const password = String(body.password || "");

    if (!token) {
      return Response.json({ error: "Reset token is required." }, { status: 400 });
    }
    if (!password || password.length < 12) {
      return Response.json({ error: "Password must be at least 12 characters." }, { status: 400 });
    }

    // Find a valid, unused, non-expired token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token,
        usedAt:    null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!resetToken) {
      return Response.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Atomically update password and mark token used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data:  { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data:  { usedAt: new Date() },
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/reset-password]", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
