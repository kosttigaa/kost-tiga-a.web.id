import { Plus, Search, Send, Edit, LogOut } from 'lucide-react';
import {
  formatRupiah,
  formatDate,
  getRoomDisplayNumber,
  getRoomLocation,
} from '../../utils/formatters';

export default function TenantsView({
  tenants,
  tenantSearch,
  setTenantSearch,
  roomByNumber,
  onAddTenant,
  onEditTenant,
  onCheckoutTenant,
  onSendWhatsAppReminder,
}) {
  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
    getRoomDisplayNumber(t.roomNumber).includes(tenantSearch) ||
    getRoomLocation(t.roomNumber, roomByNumber).toLowerCase().includes(tenantSearch.toLowerCase()) ||
    t.phone.includes(tenantSearch)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#526b5b] mb-1">
            ADMINISTRASI SITUS
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#242d29] font-heading tracking-[-0.025em] leading-tight">
            Penghuni
          </h1>
          <p className="text-[14px] text-[#6d716a] mt-1">
            Manajemen kontak penyewa, masa sewa, nomor kamar, dan tagihan WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddTenant}
          className="w-full sm:w-auto justify-center min-h-[42px] px-4 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Check-in Penghuni Baru
        </button>
      </div>

      <div className="bg-white p-3 sm:p-3.5 rounded-[12px] border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] flex items-center gap-3">
        <Search className="w-5 h-5 text-[#6d716a] shrink-0" />
        <input
          type="text"
          placeholder="Cari nama penghuni, nomor kamar, atau no handphone..."
          value={tenantSearch}
          onChange={(e) => setTenantSearch(e.target.value)}
          className="w-full text-sm text-[#242d29] placeholder:text-[#9c978b] focus:outline-none bg-transparent"
        />
      </div>

      {/* Mobile Tenants Card Feed (visible on < md screens) */}
      <div className="block md:hidden space-y-3">
        {filteredTenants.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e8e1d1] p-8 text-center text-slate-400 text-sm">
            {tenantSearch ? 'Tidak ada penghuni yang sesuai pencarian.' : 'Belum ada penghuni terdaftar.'}
          </div>
        ) : (
          filteredTenants.map((tenant) => (
            <div
              key={tenant.id}
              className="bg-white rounded-2xl border border-[#e8e1d1] p-4 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {getRoomDisplayNumber(tenant.roomNumber)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{tenant.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {getRoomLocation(tenant.roomNumber, roomByNumber)}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${tenant.paymentStatus === 'paid'
                      ? 'bg-emerald-100 text-emerald-800'
                      : tenant.paymentStatus === 'overdue'
                        ? 'bg-rose-100 text-rose-800 font-bold'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                >
                  {tenant.paymentStatus === 'paid' ? 'Lunas' : tenant.paymentStatus === 'overdue' ? 'Telat' : 'Menunggu'}
                </span>
              </div>

              <div className="bg-[#faf8f5] rounded-xl p-2.5 border border-[#e8e1d1]/70 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-[11px] text-slate-400">Kontak:</span>
                  <span className="font-semibold text-slate-800">{tenant.phone}</span>
                </div>
                {tenant.ktp && (
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-400">NIK / KTP:</span>
                    <span className="font-mono text-[11px] text-slate-700">{tenant.ktp}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[11px] text-slate-400">Masuk & Jatuh Tempo:</span>
                  <span className="font-medium text-slate-800">
                    {formatDate(tenant.entryDate)} → <strong className="text-slate-900">{formatDate(tenant.dueDate)}</strong>
                  </span>
                </div>
                {tenant.deposit > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-400">Deposit:</span>
                    <span className="font-medium text-slate-700">{formatRupiah(tenant.deposit)}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  title="Kirim Tagihan via WhatsApp"
                  onClick={() => onSendWhatsAppReminder(tenant)}
                  className="w-full justify-center min-h-[36px] px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WA</span>
                </button>
                <button
                  type="button"
                  title="Edit Biodata"
                  onClick={() => onEditTenant(tenant)}
                  className="w-full justify-center min-h-[36px] px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5 text-slate-600" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  title="Check Out Kamar"
                  onClick={() => {
                    if (window.confirm(`Yakin ingin melakukan check-out untuk ${tenant.name} dari ${getRoomLocation(tenant.roomNumber, roomByNumber)}?`)) {
                      onCheckoutTenant(tenant);
                    }
                  }}
                  className="w-full justify-center min-h-[36px] px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  <span>Out</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Tenants Table (visible on >= md screens) */}
      <div className="hidden md:block bg-white rounded-xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#eeeadf] border-b border-[#e8e1d1] text-[11px] font-bold text-[#3c4540] uppercase tracking-[0.05em]">
                <th className="py-3.5 px-4">Penghuni & Kamar</th>
                <th className="py-3.5 px-4">Kontak / KTP</th>
                <th className="py-3.5 px-4">Tgl Masuk</th>
                <th className="py-3.5 px-4">Jatuh Tempo</th>
                <th className="py-3.5 px-4">Status Bayar</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    {tenantSearch ? 'Tidak ada penghuni yang sesuai pencarian.' : 'Belum ada penghuni terdaftar.'}
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                          {getRoomDisplayNumber(tenant.roomNumber)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{tenant.name}</p>
                          <p className="text-xs text-slate-500">{getRoomLocation(tenant.roomNumber, roomByNumber)}</p>
                          <p className="text-xs text-slate-500">Deposit: {formatRupiah(tenant.deposit || 0)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-slate-800 font-medium">{tenant.phone}</p>
                      <p className="text-xs text-slate-400 font-mono">NIK: {tenant.ktp}</p>
                    </td>
                    <td className="py-4 px-4 text-slate-600">{formatDate(tenant.entryDate)}</td>
                    <td className="py-4 px-4 font-medium text-slate-900">{formatDate(tenant.dueDate)}</td>
                    <td className="py-4 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${tenant.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tenant.paymentStatus === 'overdue'
                              ? 'bg-rose-100 text-rose-800 font-bold'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                      >
                        {tenant.paymentStatus === 'paid' ? 'Lunas' : tenant.paymentStatus === 'overdue' ? 'Telat' : 'Menunggu'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          title="Kirim Tagihan via WhatsApp"
                          onClick={() => onSendWhatsAppReminder(tenant)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Edit Biodata"
                          onClick={() => onEditTenant(tenant)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Check Out Kamar"
                          onClick={() => {
                            if (window.confirm(`Yakin ingin melakukan check-out untuk ${tenant.name} dari ${getRoomLocation(tenant.roomNumber, roomByNumber)}?`)) {
                              onCheckoutTenant(tenant);
                            }
                          }}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
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

