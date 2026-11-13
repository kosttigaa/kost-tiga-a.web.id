import { Plus, Check } from 'lucide-react';
import {
  formatRupiah,
  formatDate,
  getRoomLocation,
} from '../../utils/formatters';

export default function ComplaintsView({
  complaints,
  roomByNumber,
  onOpenComplaintModal,
  onUpdateComplaintStatus,
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#526b5b] mb-1">
            ADMINISTRASI SITUS
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#242d29] font-heading tracking-[-0.025em] leading-tight">
            Keluhan
          </h1>
          <p className="text-[14px] text-[#6d716a] mt-1">
            Tangani keluhan penghuni, servis AC, fasilitas kamar, dan perawatan kost.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenComplaintModal}
          className="min-h-[42px] px-4 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Buat Tiket Keluhan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {complaints.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-400 text-sm">
            Tidak ada laporan keluhan aktif saat ini. ✨
          </div>
        ) : (
          complaints.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-mono font-bold text-slate-400">{item.id}</span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      item.status === 'resolved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'in_progress'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {item.status === 'resolved' ? 'Selesai' : item.status === 'in_progress' ? 'Dikerjakan' : 'Menunggu'}
                  </span>
                </div>

                <div className="mt-3">
                  <h4 className="font-bold text-base text-slate-900">{getRoomLocation(item.roomNumber, roomByNumber)}</h4>
                  <p className="text-xs text-slate-500">Pelapor: {item.tenantName}</p>
                  <p className="text-sm text-slate-700 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    "{item.issue}"
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>Estimasi Biaya:</span>
                  <strong className="text-slate-800 font-semibold">{formatRupiah(item.costEst)}</strong>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">{formatDate(item.date)}</span>
                <div className="flex gap-1.5">
                  {item.status !== 'in_progress' && item.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => onUpdateComplaintStatus(item.id, 'in_progress')}
                      className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg cursor-pointer"
                    >
                      Proses
                    </button>
                  )}
                  {item.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => onUpdateComplaintStatus(item.id, 'resolved')}
                      className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Selesai
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

