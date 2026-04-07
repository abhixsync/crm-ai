import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["ADMIN", "SALES"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const packs = await prisma.creditPack.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ packs });
}
