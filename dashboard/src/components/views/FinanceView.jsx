import { Plus, FileText, Trash2 } from 'lucide-react';
import {
  formatRupiah,
  formatDate,
  getRoomLocation,
  formatTransactionNote,
} from '../../utils/formatters';

export default function FinanceView({
  transactions,
  totalIncome,
  totalExpense,
  netProfit,
  roomByNumber,
  onAddTransaction,
  onSelectReceipt,
  onDeleteTransaction,
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#526b5b] mb-1">
            ADMINISTRASI SITUS
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#242d29] font-heading tracking-[-0.025em] leading-tight">
            Keuangan
          </h1>
          <p className="text-[14px] text-[#6d716a] mt-1">
            Catatan mutasi kas masuk, pengeluaran operasional, dan kuitansi pembayaran.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddTransaction}
          className="w-full sm:w-auto justify-center min-h-[42px] px-4 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Tambah Transaksi
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d716a]">Pemasukan Kas</span>
          <p className="text-xl sm:text-2xl font-extrabold text-[#3f6e52] mt-2 font-heading">{formatRupiah(totalIncome)}</p>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d716a]">Pengeluaran Operasional</span>
          <p className="text-xl sm:text-2xl font-extrabold text-[#b97862] mt-2 font-heading">{formatRupiah(totalExpense)}</p>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d716a]">Saldo / Laba Bersih</span>
          <p className="text-xl sm:text-2xl font-extrabold text-[#354c3f] mt-2 font-heading">{formatRupiah(netProfit)}</p>
        </div>
      </div>

      {/* Mobile Transactions Card Feed (visible on < md screens) */}
      <div className="block md:hidden space-y-3">
        <div className="bg-white rounded-xl border border-[#e8e1d1] p-3.5 flex justify-between items-center shadow-xs">
          <h3 className="font-bold text-[#242d29] text-sm font-heading">Riwayat Transaksi</h3>
          <span className="text-xs text-[#6d716a] font-medium">{transactions.length} Mutasi</span>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e8e1d1] p-8 text-center text-slate-400 text-sm">
            Belum ada riwayat transaksi.
          </div>
        ) : (
          transactions.map((trx) => (
            <div
              key={trx.id}
              className="bg-white rounded-2xl border border-[#e8e1d1] p-4 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${trx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{trx.category}</h4>
                    <p className="font-mono text-[11px] text-slate-400 mt-0.5">{trx.id} • {formatDate(trx.date)}</p>
                  </div>
                </div>
                <div className={`text-base font-extrabold ${trx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {trx.type === 'income' ? '+' : '-'} {formatRupiah(trx.amount)}
                </div>
              </div>

              <div className="bg-[#faf8f5] rounded-xl p-2.5 border border-[#e8e1d1]/70 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-[11px] text-slate-400">Penyewa / Kamar:</span>
                  <span className="font-semibold text-slate-800">
                    {trx.tenantName !== '-' ? trx.tenantName : '-'} ({trx.roomNumber !== '-' ? getRoomLocation(trx.roomNumber, roomByNumber) : 'Umum'})
                  </span>
                </div>
                {trx.note && (
                  <div className="flex justify-between gap-2">
                    <span className="text-[11px] text-slate-400 shrink-0">Catatan:</span>
                    <span className="text-slate-700 text-right">{formatTransactionNote(trx, roomByNumber)}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {trx.type === 'income' && (
                  <button
                    type="button"
                    onClick={() => onSelectReceipt(trx)}
                    className="flex-1 justify-center min-h-[34px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-xl inline-flex items-center gap-1.5 font-bold transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" /> Kuitansi
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteTransaction(trx)}
                  aria-label={`Hapus transaksi ${trx.id}`}
                  className={`${trx.type === 'income' ? 'flex-initial' : 'flex-1 justify-center'} min-h-[34px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs rounded-xl inline-flex items-center gap-1.5 font-bold transition cursor-pointer`}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Transactions Table (visible on >= md screens) */}
      <div className="hidden md:block bg-white rounded-xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] overflow-hidden">
        <div className="p-4 border-b border-[#e8e1d1] flex justify-between items-center">
          <h3 className="font-bold text-[#242d29] font-heading">Riwayat Mutasi Terakhir</h3>
          <span className="text-xs text-[#6d716a]">{transactions.length} Transaksi Tercatat</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#eeeadf] border-b border-[#e8e1d1] text-[11px] font-bold text-[#3c4540] uppercase tracking-[0.05em]">
                <th className="py-3 px-4">ID & Tanggal</th>
                <th className="py-3 px-4">Kategori & Catatan</th>
                <th className="py-3 px-4">Penghuni / Kamar</th>
                <th className="py-3 px-4 text-right">Nominal</th>
                <th className="py-3 px-4 text-center">Kuitansi</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    Belum ada riwayat transaksi.
                  </td>
                </tr>
              ) : (
                transactions.map((trx) => (
                  <tr key={trx.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4">
                      <p className="font-mono text-xs font-bold text-slate-600">{trx.id}</p>
                      <p className="text-xs text-slate-400">{formatDate(trx.date)}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${trx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="font-semibold text-slate-800">{trx.category}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{formatTransactionNote(trx, roomByNumber)}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-slate-800 font-medium">{trx.tenantName !== '-' ? trx.tenantName : '-'}</p>
                      <p className="text-xs text-slate-400">{trx.roomNumber !== '-' ? getRoomLocation(trx.roomNumber, roomByNumber) : 'Umum'}</p>
                    </td>
                    <td className={`py-3.5 px-4 text-right font-bold ${trx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {trx.type === 'income' ? '+' : '-'} {formatRupiah(trx.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {trx.type === 'income' ? (
                        <button
                          type="button"
                          onClick={() => onSelectReceipt(trx)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg inline-flex items-center gap-1 font-medium transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" /> Kuitansi
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(trx)}
                        aria-label={`Hapus transaksi ${trx.id}`}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs rounded-lg inline-flex items-center gap-1 font-medium transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
