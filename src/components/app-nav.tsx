import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/app/actions";
import { canManageUsers, canUpload, roleLabel } from "@/lib/roles";

const links = [
  { href: "/summary", label: "Summary" },
  { href: "/detail", label: "Detail" },
  { href: "/upload", label: "Upload", needsUpload: true },
  { href: "/users", label: "Users", needsAdmin: true },
] as const;

export async function AppNav({ activePath }: { activePath: string }) {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const role = session.user.role;

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/summary"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            OP Anywhere
          </Link>
          <nav className="flex flex-wrap gap-1">
            {links.map((link) => {
              if ("needsUpload" in link && link.needsUpload && !canUpload(role)) {
                return null;
              }
              if ("needsAdmin" in link && link.needsAdmin && !canManageUsers(role)) {
                return null;
              }
              const active = activePath === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="font-medium text-slate-900">{session.user.name}</div>
            <div className="text-xs text-slate-500">
              {roleLabel(role)} · {session.user.email}
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
