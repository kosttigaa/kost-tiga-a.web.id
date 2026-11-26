import { User, Lock } from 'lucide-react';
import Logo3A from '../common/Logo3A';

export default function LoginView({
  username,
  setUsername,
  password,
  setPassword,
  loginError,
  isLoggingIn,
  onSubmit,
}) {
  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-[0_16px_40px_rgba(36,45,41,0.08)] border border-slate-200 p-8">
        <div className="text-center mb-6">
          <Logo3A size="xl" className="mb-3" />
          <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">Kost Tiga A</h1>
          <p className="text-xs text-slate-500 mt-1">Masuk ke Panel Pengelola Kost</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                required
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="admin / penjaga"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#354c3f] bg-white text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Kata Sandi</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                required
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#354c3f] bg-white text-slate-900"
              />
            </div>
          </div>

          {loginError && (
            <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-2.5 bg-[#354c3f] hover:bg-[#1f3028] disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow transition cursor-pointer"
          >
            {isLoggingIn ? 'Memeriksa…' : 'Masuk Dashboard'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Terakhir diperbarui {import.meta.env.VITE_BUILD_TIME} WIB
        </p>
      </div>
    </div>
  );
}

