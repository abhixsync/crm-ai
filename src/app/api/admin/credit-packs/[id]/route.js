import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function PUT(req, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const pack = await prisma.creditPack.update({ where: { id: params.id }, data });
  return NextResponse.json({ pack });
}

export async function DELETE(req, { params }) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete — deactivate, don't remove (preserves purchase history)
  await prisma.creditPack.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
