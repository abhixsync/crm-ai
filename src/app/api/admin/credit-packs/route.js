import { NextResponse } from "next/server";
import { requireSession, hasRole } from "@/lib/server/auth-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const packs = await prisma.creditPack.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ packs });
}

export async function POST(req) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  if (!hasRole(auth.session, ["SUPER_ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const pack = await prisma.creditPack.create({ data });
  return NextResponse.json({ pack }, { status: 201 });
}
