import { AppNav } from "@/components/app-nav";
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
    },
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#e2e8f0_100%)]">
      <AppNav activePath="/users" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Users
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Create and manage Admin, Manager, and User accounts.
          </p>
        </div>
        <UsersManager users={users} />
      </main>
    </div>
  );
}
