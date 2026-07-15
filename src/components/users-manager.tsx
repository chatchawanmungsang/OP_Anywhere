"use client";

import { useState, useTransition } from "react";
import {
  createUserAction,
  updateUserAction,
  type ActionResult,
} from "@/app/actions";
import { Role } from "@prisma/client";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

export function UsersManager({ users }: { users: UserRow[] }) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: (fd: FormData) => Promise<ActionResult>,
    form: HTMLFormElement,
  ) {
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await action(fd);
      setMessage(res);
      if (res.ok) {
        form.reset();
        setEditing(null);
      }
    });
  }

  return (
    <div className="space-y-8">
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

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
              defaultValue={editing?.role ?? Role.USER}
              key={`role-${editing?.id ?? "new"}`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={Role.ADMIN}>Admin</option>
              <option value={Role.MANAGER}>Manager</option>
              <option value={Role.USER}>User</option>
            </select>
          </div>
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

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{user.name}</td>
                <td className="px-3 py-2 text-slate-600">{user.email}</td>
                <td className="px-3 py-2">{user.role}</td>
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
      </section>
    </div>
  );
}
