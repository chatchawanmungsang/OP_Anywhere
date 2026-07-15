import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#99f6e4_0%,_#f8fafc_40%,_#cbd5e1_100%)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/90 p-8 shadow-xl shadow-slate-900/10 backdrop-blur">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            OP Anywhere
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Excel data collection for your team. Default admin:
            admin@example.com / admin123
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
