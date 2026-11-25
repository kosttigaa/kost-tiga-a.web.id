import { useState, useMemo } from 'react';
import {
  Search,
  UserCheck,
  Check,
  X,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Clock,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { getToken } from '../../api';

export default function RegistrationsView({
  registrations = [],
  onUpdateStatus,
  onCheckInFromRegistration,
  onDeleteRegistration,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [kostFilter, setKostFilter] = useState('all');
  const [previewImage, setPreviewImage] = useState(null);

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of registrations) {
      if (r.status === 'approved') approved += 1;
      else if (r.status === 'rejected') rejected += 1;
      else pending += 1;
    }
    return { total: registrations.length, pending, approved, rejected };
  }, [registrations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registrations.filter((r) => {
      if (statusFilter !== 'all' && (r.status || 'pending') !== statusFilter) return false;
      if (kostFilter !== 'all') {
        const k = (r.kost || '').toLowerCase();
        if (!k.includes(kostFilter.toLowerCase())) return false;
      }
      if (!q) return true;
      return (
        (r.fullName || '').toLowerCase().includes(q) ||
        (r.phone || '').includes(q) ||
        (r.nik || '').includes(q) ||
        (r.vehicle || '').toLowerCase().includes(q) ||
        (r.address || '').toLowerCase().includes(q)
      );
    });
  }, [registrations, search, statusFilter, kostFilter]);

  const token = getToken();

  const getUploadUrl = (filename) => {
    if (!filename) return null;
    return `/dashboard/api/uploads/${encodeURIComponent(filename)}?token=${encodeURIComponent(token || '')}`;
  };

  const cleanPhone = (phone) => {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '62' + digits.slice(1);
    return digits;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#526b5b] mb-1">
            PENDAFTARAN SITUS WEB
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#242d29] font-heading tracking-[-0.025em] leading-tight">
            Pendaftar Online
          </h1>
          <p className="text-[14px] text-[#6d716a] mt-1">
            Daftar calon penghuni yang mendaftar melalui formulir resmi https://kost-tiga-a.web.id/daftar.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-xl border text-left transition cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-[#1f3028] text-white border-[#1f3028] shadow-sm'
              : 'bg-white text-[#242d29] border-[#e8e1d1] hover:border-[#d8cba9]'
          }`}
        >
          <p className={`text-xs font-semibold ${statusFilter === 'all' ? 'text-white/80' : 'text-[#6d716a]'}`}>
            Total Pendaftar
          </p>
          <p className="text-2xl font-extrabold mt-1 font-heading">{stats.total}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`p-4 rounded-xl border text-left transition cursor-pointer ${
            statusFilter === 'pending'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white text-[#242d29] border-[#e8e1d1] hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-xs font-semibold ${statusFilter === 'pending' ? 'text-white/80' : 'text-amber-700'}`}>
              Menunggu Konfirmasi
            </p>
            <Clock className="w-4 h-4 opacity-70" />
          </div>
          <p className="text-2xl font-extrabold mt-1 font-heading">{stats.pending}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('approved')}
          className={`p-4 rounded-xl border text-left transition cursor-pointer ${
            statusFilter === 'approved'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
              : 'bg-white text-[#242d29] border-[#e8e1d1] hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-xs font-semibold ${statusFilter === 'approved' ? 'text-white/80' : 'text-emerald-700'}`}>
              Disetujui
            </p>
            <Check className="w-4 h-4 opacity-70" />
          </div>
          <p className="text-2xl font-extrabold mt-1 font-heading">{stats.approved}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('rejected')}
          className={`p-4 rounded-xl border text-left transition cursor-pointer ${
            statusFilter === 'rejected'
              ? 'bg-rose-700 text-white border-rose-700 shadow-sm'
              : 'bg-white text-[#242d29] border-[#e8e1d1] hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-xs font-semibold ${statusFilter === 'rejected' ? 'text-white/80' : 'text-rose-700'}`}>
              Ditolak
            </p>
            <X className="w-4 h-4 opacity-70" />
          </div>
          <p className="text-2xl font-extrabold mt-1 font-heading">{stats.rejected}</p>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 bg-white p-3 rounded-xl border border-[#e8e1d1] flex items-center gap-2.5">
          <Search className="w-4 h-4 text-[#6d716a]" />
          <input
            type="text"
            placeholder="Cari nama calon penghuni, nomor WA, NIK, alamat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs sm:text-sm text-[#242d29] placeholder:text-[#9c978b] focus:outline-none bg-transparent"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={kostFilter}
            onChange={(e) => setKostFilter(e.target.value)}
            className="bg-white border border-[#e8e1d1] rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-[#242d29] focus:outline-none cursor-pointer"
          >
            <option value="all">Semua Lokasi Kost</option>
            <option value="athaya">Kost Putri Athaya</option>
            <option value="alya">Kost Putri Alya</option>
          </select>
        </div>
      </div>

      {/* Quick Status Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full">
        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
            statusFilter === 'pending'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-50'
          }`}
        >
          Perlu Check-In ({stats.pending})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('approved')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
            statusFilter === 'approved'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50'
          }`}
        >
          Sudah Masuk Kamar ({stats.approved})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
            statusFilter === 'all'
              ? 'bg-[#1f3028] text-white shadow-sm'
              : 'bg-white border border-[#e8e1d1] text-[#3c4540] hover:bg-[#eeeadf]'
          }`}
        >
          Semua ({stats.total})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('rejected')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
            statusFilter === 'rejected'
              ? 'bg-rose-700 text-white shadow-sm'
              : 'bg-white border border-rose-200 text-rose-800 hover:bg-rose-50'
          }`}
        >
          Ditolak ({stats.rejected})
        </button>
      </div>

      {/* Mobile Registrations Card Feed (visible on < md screens) */}
      <div className="block md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e8e1d1] p-8 text-center text-[#6d716a] text-sm">
            {statusFilter === 'pending'
              ? 'Tidak ada calon penghuni yang menunggu check-in. Semua pendaftar telah diproses.'
              : 'Tidak ada data pendaftaran yang sesuai dengan pencarian atau filter.'}
          </div>
        ) : (
          filtered.map((item) => {
            const phoneDigits = cleanPhone(item.phone);
            const isPending = !item.status || item.status === 'pending';
            const isApproved = item.status === 'approved';
            const isRejected = item.status === 'rejected';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-[#e8e1d1] p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#eeeadf] text-[#354c3f] border border-[#e8e1d1]">
                        {item.kost || 'Kost Tiga A'}
                      </span>
                      <span className="text-[11px] text-[#6d716a]">{formatDate(item.date)}</span>
                    </div>
                    <h3 className="font-bold text-[#242d29] text-sm mt-1 leading-tight">{item.fullName}</h3>
                    <p className="text-[11px] text-[#6d716a] font-mono mt-0.5">NIK: {item.nik || '-'}</p>
                  </div>
                  <div>
                    {isApproved && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Check className="w-3 h-3" /> Disetujui
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <X className="w-3 h-3" /> Ditolak
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <Clock className="w-3 h-3" /> Perlu Proses
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-[#faf8f5] rounded-xl p-2.5 border border-[#e8e1d1]/70 text-xs text-slate-600 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Kontak WhatsApp:</span>
                    <div className="flex items-center gap-1.5 font-semibold text-[#242d29]">
                      <span>{item.phone}</span>
                      {phoneDigits && (
                        <a
                          href={`https://wa.me/${phoneDigits}?text=Halo%20kak%20${encodeURIComponent(item.fullName)}%2C%20terkait%20pendaftaran%20di%20${encodeURIComponent(item.kost || 'Kost Tiga A')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:text-emerald-800 p-0.5"
                          title="Chat WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  {(item.guardianName || item.guardianPhone) && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Wali:</span>
                      <span className="text-slate-700">{item.guardianName || '-'} ({item.guardianPhone || '-'})</span>
                    </div>
                  )}
                  {item.vehicle && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Kendaraan:</span>
                      <span className="text-slate-700">{item.vehicle}</span>
                    </div>
                  )}
                  {item.address && (
                    <div className="text-[11px] text-slate-500 pt-0.5 border-t border-slate-200/60">
                      Alamat: {item.address}
                    </div>
                  )}
                </div>

                {/* Documents / Files */}
                <div className="flex items-center gap-2">
                  {item.ktpImage ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(getUploadUrl(item.ktpImage))}
                      className="flex-1 justify-center min-h-[32px] px-2.5 py-1 bg-white border border-[#e8e1d1] rounded-lg text-xs font-semibold text-[#354c3f] hover:bg-[#eeeadf] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5" /> Lihat KTP
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 flex-1 text-center">Tanpa KTP</span>
                  )}

                  {item.pdfFile && (
                    <a
                      href={getUploadUrl(item.pdfFile)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 justify-center min-h-[32px] px-2.5 py-1 bg-white border border-sky-200 rounded-lg text-xs font-semibold text-sky-700 hover:bg-sky-50 inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" /> Bukti PDF
                    </a>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  {isPending && (
                    <>
                      <button
                        type="button"
                        onClick={() => onCheckInFromRegistration(item)}
                        className="flex-1 justify-center min-h-[36px] px-3 py-1.5 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Check-In Kamar
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(item.id, 'rejected')}
                        className="min-h-[36px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Tolak
                      </button>
                    </>
                  )}
                  {!isPending && (
                    <>
                      <span className="flex-1 text-[11px] text-slate-400">Pendaftaran telah diproses</span>
                      <button
                        type="button"
                        onClick={() => onDeleteRegistration(item)}
                        className="min-h-[34px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop List / Table (visible on >= md screens) */}
      <div className="hidden md:block bg-white rounded-xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-[#6d716a] text-sm">
            {statusFilter === 'pending'
              ? 'Tidak ada calon penghuni yang menunggu check-in. Semua pendaftar telah diproses.'
              : 'Tidak ada data pendaftaran yang sesuai dengan pencarian atau filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#e8e1d1] bg-[#faf7f0] text-[11px] font-bold uppercase tracking-wider text-[#6d716a]">
                  <th className="py-3 px-4">Tanggal & Kost</th>
                  <th className="py-3 px-4">Calon Penghuni</th>
                  <th className="py-3 px-4">Kontak & Wali</th>
                  <th className="py-3 px-4">Kendaraan</th>
                  <th className="py-3 px-4">Berkas</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e1d1]">
                {filtered.map((item) => {
                  const phoneDigits = cleanPhone(item.phone);
                  const isPending = !item.status || item.status === 'pending';
                  const isApproved = item.status === 'approved';
                  const isRejected = item.status === 'rejected';

                  return (
                    <tr key={item.id} className="hover:bg-[#faf7f0]/60 transition-colors">
                      <td className="py-3 px-4 align-top">
                        <div className="font-semibold text-[#242d29] whitespace-nowrap">
                          {formatDate(item.date)}
                        </div>
                        <span className="inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#eeeadf] text-[#354c3f] border border-[#e8e1d1]">
                          {item.kost || 'Kost Tiga A'}
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-[#242d29]">{item.fullName}</div>
                        <div className="text-[11px] text-[#6d716a] font-mono mt-0.5">NIK: {item.nik || '-'}</div>
                        {item.address && (
                          <div className="text-[11px] text-[#6d716a] mt-1 line-clamp-2 max-w-xs">
                            {item.address}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#242d29]">{item.phone}</span>
                          {phoneDigits && (
                            <a
                              href={`https://wa.me/${phoneDigits}?text=Halo%20kak%20${encodeURIComponent(item.fullName)}%2C%20terkait%20pendaftaran%20di%20${encodeURIComponent(item.kost || 'Kost Tiga A')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:text-emerald-800 p-0.5 rounded"
                              title="Chat WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {(item.guardianName || item.guardianPhone) && (
                          <div className="text-[11px] text-[#6d716a] mt-1">
                            <span className="font-medium">Wali:</span> {item.guardianName || '-'} ({item.guardianPhone || '-'})
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-[#6d716a] text-xs">
                        {item.vehicle || 'Tidak membawa'}
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-col gap-1.5">
                          {item.ktpImage ? (
                            <button
                              type="button"
                              onClick={() => setPreviewImage(getUploadUrl(item.ktpImage))}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#354c3f] hover:underline cursor-pointer"
                            >
                              <ImageIcon className="w-3.5 h-3.5" /> Foto KTP
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Tanpa KTP</span>
                          )}

                          {item.pdfFile && (
                            <a
                              href={getUploadUrl(item.pdfFile)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" /> Bukti PDF <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                              isApproved
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : isRejected
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {isApproved ? 'Disetujui' : isRejected ? 'Ditolak' : 'Menunggu'}
                          </span>
                          {item.note && (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              {item.note}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Tombol Check-In: Selalu buka modal alokasi kamar & pembayaran sewa */}
                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => onCheckInFromRegistration(item)}
                                className="px-3 py-1.5 bg-[#1f3028] hover:bg-[#354c3f] text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                                title="Pilih kamar kosong dan lakukan Check-In untuk pendaftar ini"
                              >
                                <UserCheck className="w-3.5 h-3.5" /> Check-In Kamar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Tolak pendaftaran atas nama ${item.fullName}?`)) {
                                    onUpdateStatus(item.id, 'rejected');
                                  }
                                }}
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                                title="Tolak Pendaftaran"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 inline-flex items-center gap-1">
                                ✓ Selesai Check-In
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Kembalikan status pendaftaran ${item.fullName} ke status Menunggu Check-In?`)) {
                                    onUpdateStatus(item.id, 'pending');
                                  }
                                }}
                                className="px-2 py-1 text-[11px] font-semibold rounded border border-[#e8e1d1] text-[#6d716a] hover:bg-[#eeeadf] transition cursor-pointer"
                                title="Kembalikan ke antrean pendaftar"
                              >
                                Buka Lagi
                              </button>
                            </div>
                          )}

                          {isRejected && (
                            <button
                              type="button"
                              onClick={() => onUpdateStatus(item.id, 'pending')}
                              className="px-2.5 py-1 text-xs font-semibold rounded border border-[#e8e1d1] text-[#3c4540] hover:bg-[#eeeadf] transition cursor-pointer"
                            >
                              Pulihkan ke Menunggu
                            </button>
                          )}

                          {/* Hapus */}
                          <button
                            type="button"
                            onClick={() => onDeleteRegistration(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Hapus data pendaftaran"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Foto KTP Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-4 overflow-hidden relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="font-bold text-[#242d29] text-sm">Foto KTP Pendaftar</h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-center bg-slate-100 rounded-xl overflow-hidden min-h-[300px]">
              <img
                src={previewImage}
                alt="Foto KTP"
                className="max-h-[70vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <a
                href={previewImage}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 bg-[#1f3028] text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
              >
                Buka di Tab Baru <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

