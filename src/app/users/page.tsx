import { PageShell } from "@/components/page-shell";
import { UsersManager } from "@/components/users-manager";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Role } from "@prisma/client";

export default async function UsersPage() {
  await requireRole([Role.ADMIN]);
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      hcode: true,
      hname: true,
    },
  });

  return (
    <PageShell
      activePath="/users"
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Users
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Create and manage Admin, Manager, and User accounts.
          </p>
        </div>
      }
    >
      <UsersManager users={users} />
    </PageShell>
  );
}
