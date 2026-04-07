import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = String(body?.token || "").trim();
  const password = String(body?.password || "");

  if (!token) {
    return NextResponse.json({ error: "Invite token is required." }, { status: 400 });
  }

  if (!password || password.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters." },
      { status: 400 }
    );
  }

  try {
    // Find valid, non-accepted invite
    const invite = await prisma.pendingInvite.findFirst({
      where: {
        token,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!invite) {
      return NextResponse.json(
        { error: "This invite link is invalid or has expired." },
        { status: 400 }
      );
    }

    // Check if user with this email already exists in the tenant
    const existingUser = await prisma.user.findFirst({
      where: { email: invite.email, tenantId: invite.tenantId },
      select: { id: true },
    });

    if (existingUser) {
      // Mark invite accepted and return ok
      await prisma.pendingInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const nameFromEmail = invite.email.split("@")[0].replace(/[._-]/g, " ");

    try {
      await prisma.$transaction([
        prisma.user.create({
          data: {
            email: invite.email,
            name: nameFromEmail,
            passwordHash,
            role: invite.role,
            tenantId: invite.tenantId,
            isPrimaryOwner: false,
            emailVerified: new Date(),
            isActive: true,
          },
        }),
        prisma.pendingInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        }),
      ]);
    } catch (txErr) {
      if (txErr?.code === "P2002") {
        // Concurrent request already created this user — still mark invite used and succeed
        await prisma.pendingInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        }).catch(() => {});
        return NextResponse.json({ ok: true });
      }
      throw txErr;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/auth/accept-invite] Error:", error?.message);
    return NextResponse.json({ error: "Unable to accept invite. Please try again." }, { status: 500 });
  }
}
