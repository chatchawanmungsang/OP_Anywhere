import { auth } from "@/auth";
import { canManageUsers } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !canManageUsers(session.user.role)) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const items = await prisma.refHealthOffice.findMany({
    where: {
      OR: [
        { hcode: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { hcode: "asc" },
    take: 30,
    select: { hcode: true, name: true, affiliation: true },
  });

  return NextResponse.json({
    ok: true,
    items: items.map((i) => ({
      hcode: i.hcode,
      name: i.name ?? "",
      affiliation: i.affiliation ?? "",
    })),
  });
}
