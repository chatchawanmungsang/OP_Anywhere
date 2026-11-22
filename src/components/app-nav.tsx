import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/app/actions";
import {
  canAccessRemark,
  canManageUsers,
  canUpload,
  roleLabel,
} from "@/lib/roles";

const publicLinks = [
  { href: "/", label: "หน้าแรก" },
  { href: "/by-hcode", label: "หน่วยที่รักษา" },
  { href: "/by-hmain", label: "หน่วยประจำ" },
  { href: "/payment-monthly", label: "รายงานจ่าย" },
] as const;

const authLinks = [
  { href: "/summary", label: "Summary" },
  { href: "/remark", label: "Remark", needsAdmin: true },
  { href: "/upload", label: "Upload", needsAdmin: true },
  { href: "/users", label: "Users", needsAdmin: true },
] as const;

function navLinkClass(active: boolean) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;
}

export async function AppNav({ activePath }: { activePath: string }) {
  const session = await auth();
  const user = session?.user;
  const role = user?.role;

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex w-full flex-wrap items-center justify-between gap-4 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            OP Anywhere
          </Link>
          <nav className="flex flex-wrap gap-1">
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={navLinkClass(activePath === link.href)}
              >
                {link.label}
              </Link>
            ))}
            {user && role
              ? authLinks.map((link) => {
                  if ("needsAdmin" in link && link.needsAdmin) {
                    if (link.href === "/upload" && !canUpload(role)) return null;
                    if (link.href === "/remark" && !canAccessRemark(role))
                      return null;
                    if (link.href === "/users" && !canManageUsers(role))
                      return null;
                  }
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={navLinkClass(activePath === link.href)}
                    >
                      {link.label}
                    </Link>
                  );
                })
              : null}
          </nav>
        </div>
        {user && role ? (
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <div className="font-medium text-slate-900">{user.name}</div>
              <div className="text-xs text-slate-500">
                {roleLabel(role)} · {user.email}
                {user.hcode ? ` · ${user.hcode} ${user.hname ?? ""}` : ""}
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
        ) : (
          <Link
            href="/login"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            เข้าสู่ระบบ
          </Link>
        )}
      </div>
    </header>
  );
}
