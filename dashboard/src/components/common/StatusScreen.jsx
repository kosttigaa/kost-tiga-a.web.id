import { Loader2, Database } from 'lucide-react';

export default function StatusScreen({ status, message, onRetry, onLogout }) {
  const isLoading = status === 'loading';
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 text-center">
        <div className="inline-flex p-3 rounded-2xl bg-indigo-50 text-indigo-600 mb-4">
          {isLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Database className="w-7 h-7 text-amber-600" />}
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {isLoading ? 'Menghubungkan ke Server' : 'Tidak Dapat Memuat Data'}
        </h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          {message || (isLoading ? 'Mohon tunggu, sedang mengambil data terbaru...' : 'Terjadi kendala saat menghubungi database server.')}
        </p>
        <div className="flex gap-2 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow cursor-pointer"
            >
              Coba Lagi
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl cursor-pointer"
            >
              Keluar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

