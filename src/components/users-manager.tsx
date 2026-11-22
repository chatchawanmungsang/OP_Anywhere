"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createUserAction,
  updateUserAction,
  type ActionResult,
} from "@/app/actions";
import {
  StickyTableFrame,
  stickyThClass,
  stickyTheadClass,
} from "@/components/sticky-table-frame";
import { Role } from "@prisma/client";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  hcode: string | null;
  hname: string | null;
};

type OfficeHit = { hcode: string; name: string; affiliation: string };

export function UsersManager({ users }: { users: UserRow[] }) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>(Role.USER);
  const [hcode, setHcode] = useState("");
  const [hname, setHname] = useState("");
  const [officeQ, setOfficeQ] = useState("");
  const [hits, setHits] = useState<OfficeHit[]>([]);

  useEffect(() => {
    if (editing) {
      setRole(editing.role);
      setHcode(editing.hcode ?? "");
      setHname(editing.hname ?? "");
    } else {
      setRole(Role.USER);
      setHcode("");
      setHname("");
    }
    setOfficeQ("");
    setHits([]);
  }, [editing]);

  useEffect(() => {
    if (role !== Role.MANAGER || officeQ.trim().length < 1) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/health-offices/search?q=${encodeURIComponent(officeQ.trim())}`,
        );
        const data = (await res.json()) as { items?: OfficeHit[] };
        setHits(data.items ?? []);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [officeQ, role]);

  function run(
    action: (fd: FormData) => Promise<ActionResult>,
    form: HTMLFormElement,
  ) {
    const fd = new FormData(form);
    fd.set("hcode", hcode);
    fd.set("hname", hname);
    startTransition(async () => {
      const res = await action(fd);
      setMessage(res);
      if (res.ok) {
        form.reset();
        setEditing(null);
        setHcode("");
        setHname("");
        setRole(Role.USER);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {message ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            message.ok
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.message}
        </p>
      ) : null}

      <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {editing ? `Edit ${editing.name}` : "Create user"}
        </h2>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            run(editing ? updateUserAction : createUserAction, form);
          }}
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Name</label>
            <input
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              key={`name-${editing?.id ?? "new"}`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Email</label>
            <input
              name="email"
              type="email"
              required
              defaultValue={editing?.email ?? ""}
              key={`email-${editing?.id ?? "new"}`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">
              Password {editing ? "(leave blank to keep)" : ""}
            </label>
            <input
              name="password"
              type="password"
              minLength={6}
              required={!editing}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Role</label>
            <select
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={Role.ADMIN}>Admin</option>
              <option value={Role.MANAGER}>Manager</option>
              <option value={Role.USER}>User</option>
            </select>
          </div>

          {role === Role.MANAGER ? (
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">
                หน่วยบริการ (บังคับสำหรับ Manager)
              </label>
              <input
                type="search"
                value={officeQ}
                onChange={(e) => setOfficeQ(e.target.value)}
                placeholder="ค้นหาด้วยรหัสหรือชื่อหน่วยบริการ…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {hits.length > 0 ? (
                <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                  {hits.map((h) => (
                    <li key={h.hcode}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-teal-50"
                        onClick={() => {
                          setHcode(h.hcode);
                          setHname(h.name);
                          setOfficeQ("");
                          setHits([]);
                        }}
                      >
                        <span className="font-mono font-semibold text-slate-900">
                          {h.hcode}
                        </span>
                        <span className="text-slate-700">{h.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {hcode ? (
                  <>
                    <span className="font-mono font-semibold">{hcode}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span>{hname || "—"}</span>
                  </>
                ) : (
                  <span className="text-slate-500">ยังไม่ได้เลือกหน่วยบริการ</span>
                )}
              </div>
              <input type="hidden" name="hcode" value={hcode} />
              <input type="hidden" name="hname" value={hname} />
            </div>
          ) : (
            <>
              <input type="hidden" name="hcode" value="" />
              <input type="hidden" name="hname" value="" />
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={editing?.active ?? true}
              key={`active-${editing?.id ?? "new"}`}
            />
            Active
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : editing ? "Update user" : "Create user"}
            </button>
            {editing ? (
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <StickyTableFrame>
        <table className="min-w-full text-left text-sm">
          <thead className={stickyTheadClass}>
            <tr>
              <th className={stickyThClass}>Name</th>
              <th className={stickyThClass}>Email</th>
              <th className={stickyThClass}>Role</th>
              <th className={stickyThClass}>หน่วยบริการ</th>
              <th className={stickyThClass}>Status</th>
              <th className={stickyThClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">
                  {user.name}
                </td>
                <td className="px-3 py-2 text-slate-600">{user.email}</td>
                <td className="px-3 py-2">{user.role}</td>
                <td className="px-3 py-2 text-slate-700">
                  {user.hcode ? (
                    <span>
                      <span className="font-mono text-xs font-semibold">
                        {user.hcode}
                      </span>{" "}
                      {user.hname}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {user.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setEditing(user)}
                    className="text-teal-700 hover:underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StickyTableFrame>
    </div>
  );
}
