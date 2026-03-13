import bcrypt from "bcryptjs";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";
import { databaseUnavailableResponse, isDatabaseUnavailable } from "@/lib/server/database-error";

export async function GET() {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session as any, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    return Response.json({ user });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/settings/my-account] Database unavailable on fetch.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: "Unable to load account settings." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  if (!hasRole(auth.session as any, ["ADMIN", "SUPER_ADMIN"])) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const currentPassword = String(payload?.currentPassword || "").trim();
    const newPassword = String(payload?.newPassword || "");

    if (!currentPassword) {
      return Response.json({ error: "Current password is required." }, { status: 400 });
    }

    if (!newPassword) {
      return Response.json({ error: "New password is required." }, { status: 400 });
    }

    if (newPassword && newPassword.length < 6) {
      return Response.json({ error: "New password must be at least 6 characters." }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return Response.json({ error: "New password must be different from current password." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!passwordMatches) {
      return Response.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
      },
      select: {
        id: true,
        email: true,
      },
    });

    return Response.json({ user: updatedUser });
  } catch (error: any) {
    if (isDatabaseUnavailable(error)) {
      console.warn("[api/admin/settings/my-account] Database unavailable on update.");
      return databaseUnavailableResponse();
    }

    return Response.json({ error: error?.message || "Unable to update account settings." }, { status: 400 });
  }
}
