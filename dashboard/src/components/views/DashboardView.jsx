import {
  Plus,
  DollarSign,
  BedDouble,
  TrendingUp,
  TrendingDown,
  Clock,
  Send,
} from 'lucide-react';
import {
  formatRupiah,
  formatDate,
  getRoomDisplayNumber,
  getRoomLocation,
} from '../../utils/formatters';

export default function DashboardView({
  occupancyRate,
  occupiedRooms,
  availableRooms,
  maintenanceRooms,
  totalIncome,
  totalExpense,
  netProfit,
  overdueTenants,
  openComplaints,
  roomByNumber,
  onOpenCheckIn,
  onOpenTrxModal,
  onOpenComplaintModal,
  onSelectTab,
  onSendWhatsAppReminder,
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#526b5b] mb-1">
            ADMINISTRASI SITUS
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#242d29] font-heading tracking-[-0.025em] leading-tight">
            Dashboard
          </h1>
          <p className="text-[14px] text-[#6d716a] mt-1">
            Ringkasan operasional, ketersediaan kamar, dan keuangan kost dalam satu halaman.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onOpenCheckIn}
            className="min-h-[42px] px-4 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Check-in Baru
          </button>
          <button
            type="button"
            onClick={onOpenTrxModal}
            className="min-h-[42px] px-4 bg-[#1f3028] hover:bg-[#17251e] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <DollarSign className="w-4 h-4" /> Catat Kas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tingkat Hunian</span>
            <div className="p-2 bg-[#eeeadf] text-[#354c3f] rounded-lg border border-[#e8e1d1]"><BedDouble className="w-5 h-5" /></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{occupancyRate}%</div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span className="font-medium text-emerald-600">{occupiedRooms} Terisi</span>
              <span>•</span>
              <span className="text-slate-500">{availableRooms} Kosong</span>
              <span>•</span>
              <span className="text-amber-600">{maintenanceRooms} Servis</span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${occupancyRate}%` }} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Pemasukan</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp className="w-5 h-5" /></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-600">{formatRupiah(totalIncome)}</div>
            <p className="text-xs text-slate-500 mt-1">Akumulasi sewa & denda</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pengeluaran Kost</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><TrendingDown className="w-5 h-5" /></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-600">{formatRupiah(totalExpense)}</div>
            <p className="text-xs text-slate-500 mt-1">Listrik, air, wifi & servis</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Laba Bersih</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><DollarSign className="w-5 h-5" /></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-indigo-700">{formatRupiah(netProfit)}</div>
            <p className="text-xs text-emerald-600 font-medium mt-1">Kas operasional aktif</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg"><Clock className="w-4 h-4" /></div>
              <div>
                <h3 className="font-semibold text-slate-900 text-base">Perlu Ditagih / Jatuh Tempo</h3>
                <p className="text-xs text-slate-500">Penghuni yang mendekati jatuh tempo pembayaran</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectTab('bills')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              Lihat Semua
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {overdueTenants.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">Semua pembayaran penghuni bulan ini lunas! 🎉</div>
            ) : (
              overdueTenants.map((t) => {
                const isOverdue = (t.effectivePaymentStatus || t.paymentStatus) === 'overdue';
                return (
                  <div key={t.id} className="py-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs">
                        {getRoomDisplayNumber(t.roomNumber)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                        <p className="text-xs text-slate-500">{getRoomLocation(t.roomNumber, roomByNumber)}</p>
                        <p className="text-xs text-slate-500">Jatuh Tempo: {formatDate(t.dueDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                        isOverdue ? 'bg-rose-100 text-rose-700 font-semibold' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {isOverdue ? 'Telat Bayar' : 'Menunggu Bayar'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSendWhatsAppReminder(t, t.dueDate)}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" /> WA Tagihan
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 text-base">Keluhan Terkini</h3>
              <button
                type="button"
                onClick={() => onSelectTab('complaints')}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                Buka Tiket
              </button>
            </div>
            <div className="space-y-3">
              {openComplaints.slice(0, 3).map((c) => (
                <div key={c.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-slate-700">{getRoomLocation(c.roomNumber, roomByNumber)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                      c.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {c.status === 'in_progress' ? 'Dikerjakan' : 'Belum Selesai'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{c.issue}</p>
                </div>
              ))}
              {openComplaints.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Tidak ada komplain tertunda 🛠️</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <button 
              type="button"
              onClick={onOpenComplaintModal}
              className="w-full py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              + Catat Keluhan Baru
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

