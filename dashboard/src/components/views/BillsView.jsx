import { useState, useMemo } from 'react';
import {
  Search,
  Receipt,
  Send,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import {
  formatRupiah,
  formatDate,
  getRoomDisplayNumber,
  getRoomLocation,
  getRoomTypeLabel,
  computeDueDateForMonth,
  isTenantPaidForMonth,
} from '../../utils/formatters';

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export default function BillsView({
  tenants = [],
  roomByNumber,
  transactions = [],
  onSendWhatsAppReminder,
  onPayBill,
  onUpdatePaymentStatus,
  onSelectReceipt,
  onAddTransaction,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, unpaid, overdue, pending, paid
  const [locationFilter, setLocationFilter] = useState('all'); // all, athaya, alya, andayani

  // Hari ini
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11

  // Bulan yang dipilih (Default: Bulan Berjalan)
  const [activeYear, setActiveYear] = useState(currentYear);
  const [activeMonth, setActiveMonth] = useState(currentMonth);

  const activeMonthKey = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}`;
  const isCurrentMonth = activeYear === currentYear && activeMonth === currentMonth;

  // Navigasi bulan
  const handlePrevMonth = () => {
    if (activeMonth === 0) {
      setActiveYear((y) => y - 1);
      setActiveMonth(11);
    } else {
      setActiveMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (activeMonth === 11) {
      setActiveYear((y) => y + 1);
      setActiveMonth(0);
    } else {
      setActiveMonth((m) => m + 1);
    }
  };

  const handleResetToCurrentMonth = () => {
    setActiveYear(currentYear);
    setActiveMonth(currentMonth);
  };

  // Hitung data tagihan untuk bulan yang aktif
  const bills = useMemo(() => {
    const list = tenants.map((tenant) => {
      const room = roomByNumber?.get(String(tenant.roomNumber));
      const monthlyPrice = room ? Number(room.price) : 0;

      // 1. Due date untuk bulan yang aktif
      const dueDateForMonth = computeDueDateForMonth(tenant, activeYear, activeMonth);
      const dueDateObj = new Date(dueDateForMonth + 'T00:00:00');

      let daysDiff = null;
      let isOverdueByDate = false;
      let isDueToday = false;
      let isDueSoon = false;

      if (!isNaN(dueDateObj.getTime())) {
        const diffTime = dueDateObj.getTime() - today.getTime();
        daysDiff = Math.round(diffTime / (1000 * 60 * 60 * 24));
        isOverdueByDate = daysDiff < 0;
        isDueToday = daysDiff === 0;
        isDueSoon = daysDiff > 0 && daysDiff <= 7;
      }

      // 2. Transaksi sewa di bulan ini (jika ada)
      const matchingReceipt = transactions.find(
        (trx) =>
          trx.type === 'income' &&
          (trx.category === 'Sewa Kamar' || !trx.category) &&
          trx.date?.startsWith(activeMonthKey) &&
          (trx.tenantName === tenant.name || String(trx.roomNumber) === String(tenant.roomNumber))
      );

      // 3. Status Pembayaran:
      // "deafult nya belum bayar, akan berubah jika admin mengupdate"
      let effectiveStatus;
      const manualStatus = tenant.monthlyStatus?.[activeMonthKey];

      if (manualStatus) {
        // Jika admin pernah mengubah status secara spesifik untuk bulan ini
        effectiveStatus = manualStatus;
      } else if (isTenantPaidForMonth(tenant, activeMonthKey, transactions)) {
        // Jika lunas lewat transaksi sewa, status paid bulan ini, atau konfirmasi admin
        effectiveStatus = 'paid';
      } else {
        // Default: BELUM BAYAR
        // Jika tanggal jatuh tempo sudah lewat hari ini -> overdue (Telat)
        // Jika belum lewat hari ini -> pending (Menunggu)
        effectiveStatus = isOverdueByDate ? 'overdue' : 'pending';
      }

      return {
        tenant,
        room,
        monthlyPrice,
        dueDateForMonth,
        daysDiff,
        isOverdueByDate,
        isDueToday,
        isDueSoon,
        effectiveStatus,
        latestReceipt: matchingReceipt,
      };
    });

    // URUTKAN ASCENDING BERDASARKAN DUE DATE
    // "tagihan list ascending per due date"
    list.sort((a, b) => {
      if (a.dueDateForMonth !== b.dueDateForMonth) {
        return a.dueDateForMonth.localeCompare(b.dueDateForMonth);
      }
      return String(a.tenant.roomNumber).localeCompare(String(b.tenant.roomNumber), undefined, {
        numeric: true,
      });
    });

    return list;
  }, [tenants, roomByNumber, transactions, today, activeYear, activeMonth, activeMonthKey]);

  // Statistik Ringkasan Periode Aktif
  const stats = useMemo(() => {
    let totalNominal = 0;
    let pendingNominal = 0;
    let overdueNominal = 0;
    let paidNominal = 0;

    let pendingCount = 0;
    let overdueCount = 0;
    let paidCount = 0;

    bills.forEach((b) => {
      totalNominal += b.monthlyPrice;
      if (b.effectiveStatus === 'paid') {
        paidNominal += b.monthlyPrice;
        paidCount += 1;
      } else if (b.effectiveStatus === 'overdue') {
        overdueNominal += b.monthlyPrice;
        overdueCount += 1;
      } else {
        pendingNominal += b.monthlyPrice;
        pendingCount += 1;
      }
    });

    return {
      totalCount: bills.length,
      totalNominal,
      pendingCount,
      pendingNominal,
      overdueCount,
      overdueNominal,
      paidCount,
      paidNominal,
      unpaidCount: pendingCount + overdueCount,
      unpaidNominal: pendingNominal + overdueNominal,
    };
  }, [bills]);

  // Filter bills
  const filteredBills = useMemo(() => {
    return bills.filter(({ tenant, room, effectiveStatus }) => {
      // 1. Search filter
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchName = (tenant.name || '').toLowerCase().includes(q);
        const matchRoom = String(tenant.roomNumber || '').toLowerCase().includes(q);
        const matchPhone = (tenant.phone || '').includes(q);
        const matchLoc = getRoomLocation(tenant.roomNumber, roomByNumber).toLowerCase().includes(q);
        if (!matchName && !matchRoom && !matchPhone && !matchLoc) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter === 'unpaid' && effectiveStatus === 'paid') return false;
      if (statusFilter === 'overdue' && effectiveStatus !== 'overdue') return false;
      if (statusFilter === 'pending' && effectiveStatus !== 'pending') return false;
      if (statusFilter === 'paid' && effectiveStatus !== 'paid') return false;

      // 3. Location filter
      if (locationFilter !== 'all' && room?.locationId !== locationFilter) {
        return false;
      }

      return true;
    });
  }, [bills, searchQuery, statusFilter, locationFilter, roomByNumber]);

  return (
    <div className="space-y-6">
      {/* Header & Bulan Berjalan Navigator */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#526b5b] mb-1">
            MANAJEMEN KEUANGAN & SEWA
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#242d29] font-heading tracking-[-0.025em] leading-tight">
            Tagihan & Jatuh Tempo
          </h1>
          <p className="text-[14px] text-[#6d716a] mt-1">
            Daftar tagihan terurut per jatuh tempo (ascending) untuk bulan berjalan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onAddTransaction && (
            <button
              type="button"
              onClick={onAddTransaction}
              className="min-h-[42px] px-4 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
            >
              <CreditCard className="w-4 h-4" /> Catat Pembayaran Baru
            </button>
          )}
        </div>
      </div>

      {/* Periode Bulan Berjalan Control Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 border border-[#e8e1d1] rounded-xl hover:bg-[#eeeadf] text-[#3c4540] transition cursor-pointer"
            title="Bulan Sebelumnya"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center sm:text-left">
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-[#242d29] font-heading">
                {MONTH_NAMES[activeMonth]} {activeYear}
              </span>
              {isCurrentMonth ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-[#354c3f] text-[#fffdf8]">
                  Bulan Berjalan
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                  Riwayat Periode
                </span>
              )}
            </div>
            <p className="text-xs text-[#6d716a]">
              Urutan otomatis ascending per due date (tanggal 1 s/d {new Date(activeYear, activeMonth + 1, 0).getDate()})
            </p>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 border border-[#e8e1d1] rounded-xl hover:bg-[#eeeadf] text-[#3c4540] transition cursor-pointer"
            title="Bulan Berikutnya"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {!isCurrentMonth && (
          <button
            type="button"
            onClick={handleResetToCurrentMonth}
            className="px-3 py-1.5 bg-[#eeeadf] hover:bg-[#e8e1d1] text-[#242d29] border border-[#d8cba9] rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Kembali ke Bulan Berjalan
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Tagihan Aktif */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Total Tagihan</span>
            <div className="p-1.5 sm:p-2 bg-[#eeeadf] text-[#354c3f] rounded-lg border border-[#e8e1d1]">
              <Receipt className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="text-lg sm:text-2xl font-bold text-slate-900">{formatRupiah(stats.totalNominal)}</div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
              Dari <span className="font-semibold text-slate-700">{stats.totalCount}</span> penyewa
            </p>
          </div>
        </div>

        {/* Belum Bayar / Menunggu */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-amber-600">Menunggu Bayar</span>
            <div className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="text-lg sm:text-2xl font-bold text-amber-700">{formatRupiah(stats.pendingNominal)}</div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
              <span className="font-semibold text-amber-700">{stats.pendingCount}</span> kamar
            </p>
          </div>
        </div>

        {/* Lewat Jatuh Tempo / Telat */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-rose-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-rose-600">Lewat Tempo</span>
            <div className="p-1.5 sm:p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-100">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="text-lg sm:text-2xl font-bold text-rose-600">{formatRupiah(stats.overdueNominal)}</div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
              <span className="font-semibold text-rose-600">{stats.overdueCount}</span> tagihan telat
            </p>
          </div>
        </div>

        {/* Sudah Lunas */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-600">Sudah Lunas</span>
            <div className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="text-lg sm:text-2xl font-bold text-emerald-600">{formatRupiah(stats.paidNominal)}</div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
              <span className="font-semibold text-emerald-600">{stats.paidCount}</span> kamar lunas
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="bg-white p-3 sm:p-3.5 rounded-[12px] border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] flex items-center gap-3 flex-1">
          <Search className="w-5 h-5 text-[#6d716a] shrink-0" />
          <input
            type="text"
            placeholder="Cari nama penghuni, nomor kamar, atau nomor handphone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm text-[#242d29] placeholder:text-[#9c978b] focus:outline-none bg-transparent"
          />
        </div>

        {/* Filter Buttons & Dropdowns */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-[#e8e1d1] text-xs font-semibold text-slate-600 shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'all' ? 'bg-[#1f3028] text-white shadow-xs' : 'hover:bg-slate-100'
              }`}
            >
              Semua ({stats.totalCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unpaid')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'unpaid' ? 'bg-[#1f3028] text-white shadow-xs' : 'hover:bg-slate-100'
              }`}
            >
              Belum Bayar ({stats.unpaidCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('overdue')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'overdue' ? 'bg-rose-600 text-white shadow-xs' : 'hover:bg-slate-100 text-rose-700'
              }`}
            >
              Telat ({stats.overdueCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('paid')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'paid' ? 'bg-emerald-700 text-white shadow-xs' : 'hover:bg-slate-100 text-emerald-700'
              }`}
            >
              Lunas ({stats.paidCount})
            </button>
          </div>

          {/* Location Filter */}
          <div className="relative shrink-0">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="text-xs font-semibold bg-white border border-[#e8e1d1] rounded-xl px-3 py-2 text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Lokasi</option>
              <option value="athaya">Athaya</option>
              <option value="alya">Alya</option>
              <option value="andayani">Andayani</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mobile Bills Card Feed (visible on < md screens) */}
      <div className="block md:hidden space-y-3">
        {filteredBills.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e8e1d1] p-8 text-center text-slate-400 text-sm">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
            {searchQuery || statusFilter !== 'all' || locationFilter !== 'all'
              ? 'Tidak ada data tagihan yang sesuai dengan filter pencarian.'
              : `Belum ada penghuni aktif untuk periode ${MONTH_NAMES[activeMonth]} ${activeYear}.`}
          </div>
        ) : (
          filteredBills.map(({
            tenant,
            room,
            monthlyPrice,
            dueDateForMonth,
            daysDiff,
            isOverdueByDate,
            isDueToday,
            isDueSoon,
            effectiveStatus,
            latestReceipt,
          }) => (
            <div
              key={tenant.id}
              className="bg-white rounded-2xl border border-[#e8e1d1] p-4 shadow-xs space-y-3"
            >
              {/* Header: Room badge + Tenant name & Due Date Badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {getRoomDisplayNumber(tenant.roomNumber)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{tenant.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {getRoomLocation(tenant.roomNumber, roomByNumber)}
                      {room?.type && ` • ${getRoomTypeLabel(room.type)}`}
                    </p>
                  </div>
                </div>

                {/* Due status pill */}
                <div>
                  {effectiveStatus === 'paid' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Lunas
                    </span>
                  ) : isDueToday ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      Hari Ini
                    </span>
                  ) : isOverdueByDate ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      Telat {Math.abs(daysDiff)}h
                    </span>
                  ) : isDueSoon ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      Sisa {daysDiff}h
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600">
                      {daysDiff !== null ? `Sisa ${daysDiff}h` : '-'}
                    </span>
                  )}
                </div>
              </div>

              {/* Info: Due Date + Nominal Tagihan */}
              <div className="bg-[#faf8f5] rounded-xl p-2.5 border border-[#e8e1d1]/70 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Jatuh Tempo</span>
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-800 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-[#354c3f]" />
                    <span>{formatDate(dueDateForMonth)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Nominal Tagihan</span>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                    {formatRupiah(monthlyPrice)}
                  </div>
                </div>
              </div>

              {/* Status Select & Action Buttons */}
              <div className="pt-1 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">Status:</span>
                  <select
                    value={effectiveStatus}
                    onChange={(e) => onUpdatePaymentStatus(tenant.id, e.target.value, activeMonthKey)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-bold border cursor-pointer focus:outline-none transition ${
                      effectiveStatus === 'paid'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : effectiveStatus === 'overdue'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    <option value="pending">⏳ Menunggu (Belum Bayar)</option>
                    <option value="overdue">⚠️ Telat / Lewat Tempo</option>
                    <option value="paid">✓ Lunas</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => onSendWhatsAppReminder(tenant, dueDateForMonth)}
                    className="w-full justify-center min-h-[36px] px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WA Tagihan</span>
                  </button>

                  {effectiveStatus !== 'paid' ? (
                    <button
                      type="button"
                      onClick={() => onPayBill(tenant, dueDateForMonth)}
                      className="w-full justify-center min-h-[36px] px-2.5 py-1.5 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Catat Bayar</span>
                    </button>
                  ) : latestReceipt && onSelectReceipt ? (
                    <button
                      type="button"
                      onClick={() => onSelectReceipt(latestReceipt)}
                      className="w-full justify-center min-h-[36px] px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-600" />
                      <span>Kuitansi</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPayBill(tenant, dueDateForMonth)}
                      className="w-full justify-center min-h-[36px] px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Bayar</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Bills Table - Ascending by Due Date */}
      <div className="hidden md:block bg-white rounded-xl border border-[#e8e1d1] shadow-[0_1px_3px_rgba(36,45,41,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#eeeadf] border-b border-[#e8e1d1] text-[11px] font-bold text-[#3c4540] uppercase tracking-[0.05em]">
                <th className="py-3.5 px-4">Due Date (Urut ▲)</th>
                <th className="py-3.5 px-4">Penghuni & Kamar</th>
                <th className="py-3.5 px-4">Nominal Tagihan</th>
                <th className="py-3.5 px-4">Status Pembayaran</th>
                <th className="py-3.5 px-4 text-center">Aksi / Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 text-sm">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {searchQuery || statusFilter !== 'all' || locationFilter !== 'all'
                      ? 'Tidak ada data tagihan yang sesuai dengan filter pencarian.'
                      : `Belum ada penghuni aktif untuk periode ${MONTH_NAMES[activeMonth]} ${activeYear}.`}
                  </td>
                </tr>
              ) : (
                filteredBills.map(
                  ({
                    tenant,
                    room,
                    monthlyPrice,
                    dueDateForMonth,
                    daysDiff,
                    isOverdueByDate,
                    isDueToday,
                    isDueSoon,
                    effectiveStatus,
                    latestReceipt,
                  }) => (
                    <tr key={tenant.id} className="hover:bg-slate-50/80 transition">
                      {/* 1. Due Date (Ascending) */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <Calendar className="w-4 h-4 text-[#354c3f]" />
                          <span>{formatDate(dueDateForMonth)}</span>
                        </div>
                        <div className="mt-1">
                          {effectiveStatus === 'paid' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Terbayar lunas
                            </span>
                          ) : isDueToday ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                              </span>
                              Jatuh Tempo HARI INI
                            </span>
                          ) : isOverdueByDate ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                              Lewat {Math.abs(daysDiff)} hari
                            </span>
                          ) : isDueSoon ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                              Sisa {daysDiff} hari
                            </span>
                          ) : daysDiff !== null ? (
                            <span className="text-[11px] text-slate-500">
                              Sisa {daysDiff} hari
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">-</span>
                          )}
                        </div>
                      </td>

                      {/* 2. Penghuni & Kamar */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {getRoomDisplayNumber(tenant.roomNumber)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{tenant.name}</p>
                            <p className="text-xs text-slate-500">{getRoomLocation(tenant.roomNumber, roomByNumber)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              <span>{tenant.phone}</span>
                              {room?.type && (
                                <span className="ml-1.5 px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">
                                  {getRoomTypeLabel(room.type)}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* 3. Nominal Tagihan */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-base">{formatRupiah(monthlyPrice)}</div>
                        <p className="text-[11px] text-slate-500">Tarif Sewa Bulanan</p>
                        {tenant.deposit > 0 && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Deposit: {formatRupiah(tenant.deposit)}
                          </p>
                        )}
                      </td>

                      {/* 4. Status Pembayaran: Default Belum Bayar, Berubah saat diupdate admin */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={effectiveStatus}
                            onChange={(e) => onUpdatePaymentStatus(tenant.id, e.target.value, activeMonthKey)}
                            className={`px-2.5 py-1 text-xs rounded-lg font-bold border cursor-pointer focus:outline-none transition ${
                              effectiveStatus === 'paid'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                : effectiveStatus === 'overdue'
                                ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            <option value="pending">⏳ Menunggu (Belum Bayar)</option>
                            <option value="overdue">⚠️ Telat / Lewat Tempo</option>
                            <option value="paid">✓ Lunas</option>
                          </select>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {effectiveStatus === 'paid' ? 'Telah diverifikasi lunas' : 'Default belum bayar'}
                        </p>
                      </td>

                      {/* 5. Aksi / Tindakan */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Tombol Kirim Tagihan WhatsApp */}
                          <button
                            type="button"
                            title="Kirim Pesan Tagihan via WhatsApp untuk Due Date Bulan Ini"
                            onClick={() => onSendWhatsAppReminder(tenant, dueDateForMonth)}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WA Tagihan</span>
                          </button>

                          {/* Tombol Catat Pembayaran / Lunaskan */}
                          {effectiveStatus !== 'paid' ? (
                            <button
                              type="button"
                              title="Catat transaksi pembayaran kas dan lunaskan tagihan bulan ini"
                              onClick={() => onPayBill(tenant, dueDateForMonth)}
                              className="px-2.5 py-1.5 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Catat Bayar</span>
                            </button>
                          ) : latestReceipt && onSelectReceipt ? (
                            <button
                              type="button"
                              title="Lihat Kuitansi Pembayaran Terakhir"
                              onClick={() => onSelectReceipt(latestReceipt)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-600" />
                              <span>Kuitansi</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Catat Pembayaran Tambahan"
                              onClick={() => onPayBill(tenant, dueDateForMonth)}
                              className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Bayar</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Card / Tips Pengingat Tagihan */}
      <div className="p-4 rounded-xl bg-[#eeeadf]/60 border border-[#e8e1d1] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#515651]">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#354c3f] shrink-0" />
          <span>
            <strong>Sistem Tagihan Bulanan:</strong> Daftar tagihan otomatis mengikuti bulan berjalan dan diurutkan dari due date terawal (ascending). Status sewa default belum bayar dan akan berubah menjadi Lunas ketika admin memilih opsi <em>✓ Lunas</em> atau menyimpan transaksi di tombol <em>Catat Bayar</em>.
          </span>
        </div>
      </div>
    </div>
  );
}
