import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  ROLE_TABS,
  IDLE_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  SYNC_INTERVAL_MS,
  SYNC_RETRY_MS,
} from './constants/kost';
import {
  formatRupiah,
  formatDate,
  getRoomLabel,
  getRoomLocation,
  formatTransactionNote,
  getNextTransactionId,
  computeDueDateForMonth,
  isTenantPaidForMonth,
} from './utils/formatters';
import { migrateRoomLocations, readLocalData } from './utils/migration';
import {
  ApiError,
  buildSnapshot,
  clearToken,
  diffData,
  downloadExport,
  emptySnapshot,
  fetchData,
  getToken,
  login,
  pushChanges,
  setToken,
} from './api';
import { useIdleTimeout } from './hooks/useIdleTimeout';

// Components
import StatusScreen from './components/common/StatusScreen';
import LoginView from './components/views/LoginView';
import HeaderNav from './components/layout/HeaderNav';
import DashboardView from './components/views/DashboardView';
import RoomsView from './components/views/RoomsView';
import TenantsView from './components/views/TenantsView';
import BillsView from './components/views/BillsView';
import FinanceView from './components/views/FinanceView';
import ComplaintsView from './components/views/ComplaintsView';
import RegistrationsView from './components/views/RegistrationsView';

// Modals
import RoomModal from './components/modals/RoomModal';
import TenantModal from './components/modals/TenantModal';
import TransactionModal from './components/modals/TransactionModal';
import ComplaintModal from './components/modals/ComplaintModal';
import ReceiptModal from './components/modals/ReceiptModal';

const checkInitialAuth = () => {
  const token = getToken();
  const savedRole = localStorage.getItem('juragankost_role');
  if (!token || !ROLE_TABS[savedRole]) {
    clearToken();
    return { isAuth: false, error: '' };
  }
  const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  if (lastActivity && Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    clearToken();
    return { isAuth: false, error: 'Sesi sebelumnya telah berakhir karena tidak ada aktivitas. Silakan login kembali.' };
  }
  return { isAuth: true, error: '' };
};

export default function App() {
  // Autentikasi
  const [initialAuth] = useState(() => checkInitialAuth());
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth.isAuth);
  const [role, setRole] = useState(() => {
    const saved = localStorage.getItem('juragankost_role');
    return ROLE_TABS[saved] ? saved : 'admin';
  });
  const allowedTabs = ROLE_TABS[role] || ROLE_TABS.admin;
  const isAdmin = role === 'admin';
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr] = useState(initialAuth.error);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState('rooms');

  // Data disimpan di database SQLite server dan disinkronkan lewat API
  const [rooms, setRooms] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [dataStatus, setDataStatus] = useState('loading');
  const [dataMessage, setDataMessage] = useState('');
  const [syncState, setSyncState] = useState('saved');
  const [retryTick, setRetryTick] = useState(0);
  const [loadTick, setLoadTick] = useState(0);

  const snapshotRef = useRef(emptySnapshot());
  const latestDataRef = useRef({ rooms, tenants, transactions, complaints, registrations });
  const inFlightRef = useRef(0);
  const pushChainRef = useRef(Promise.resolve());

  const roomByNumber = useMemo(() => new Map(rooms.map(room => [String(room.number), room])), [rooms]);
  const tenantByRoom = useMemo(() => new Map(tenants.map(tenant => [String(tenant.roomNumber), tenant])), [tenants]);
  const roomsPerLocation = useMemo(() => rooms.reduce((counts, room) => {
    counts[room.locationId] = (counts[room.locationId] || 0) + 1;
    return counts;
  }, {}), [rooms]);
  const openComplaints = useMemo(() => complaints.filter(complaint => complaint.status !== 'resolved'), [complaints]);
  const pendingRegistrationsCount = useMemo(() => registrations.filter(r => !r.status || r.status === 'pending').length, [registrations]);

  // Modals & form state
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [isTrxModalOpen, setIsTrxModalOpen] = useState(false);
  const [trxInitialData, setTrxInitialData] = useState(null);
  const [receiptTrx, setReceiptTrx] = useState(null);
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);

  // Filters & search
  const [roomFilterStatus, setRoomFilterStatus] = useState('all');
  const [roomFilterLocation, setRoomFilterLocation] = useState('all');
  const [tenantSearch, setTenantSearch] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState(null);
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const clearSession = useCallback((reason = '') => {
    clearToken();
    localStorage.removeItem('juragankost_auth');
    localStorage.removeItem('juragankost_role');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setDataStatus('loading');
    setIsAuthenticated(false);
    if (reason) {
      setLoginErr(reason);
    }
  }, []);

  // Idle timeout hook
  useIdleTimeout(isAuthenticated, clearSession);

  const applyServerData = useCallback((data) => {
    const next = {
      rooms: migrateRoomLocations(data.rooms, data.tenants),
      tenants: data.tenants,
      transactions: data.transactions,
      complaints: data.complaints,
      registrations: data.registrations || [],
    };
    snapshotRef.current = buildSnapshot(data);
    setRooms(next.rooms);
    setTenants(next.tenants);
    setTransactions(next.transactions);
    setComplaints(next.complaints);
    setRegistrations(next.registrations);
  }, []);

  const handleSyncError = useCallback((err, fallbackMessage) => {
    if (err instanceof ApiError && err.status === 401) {
      clearSession('Sesi Anda telah kedaluwarsa. Silakan login kembali.');
      return;
    }
    setDataMessage(err instanceof ApiError && err.status !== 0 ? err.message : fallbackMessage);
  }, [clearSession]);

  // Muat data dari server saat login
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchData();
        if (cancelled) return;

        if (data.initialized) {
          applyServerData(data);
        } else if (role === 'admin') {
          const local = readLocalData();
          await pushChanges(diffData(emptySnapshot(), local).changes, { init: true });
          if (cancelled) return;
          applyServerData(local);
        } else {
          setDataMessage('Database server belum disiapkan. Minta Admin untuk login terlebih dahulu.');
          setDataStatus('error');
          return;
        }
        setDataMessage('');
        setSyncState('saved');
        setDataStatus('ready');
      } catch (err) {
        if (cancelled) return;
        handleSyncError(err, 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.');
        setDataStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated, role, loadTick, applyServerData, handleSyncError]);

  useEffect(() => {
    latestDataRef.current = { rooms, tenants, transactions, complaints, registrations };
  }, [rooms, tenants, transactions, complaints, registrations]);

  // Kirim perubahan ke server setiap kali data berubah
  useEffect(() => {
    if (dataStatus !== 'ready') return undefined;
    const { changes, hasChanges, nextSnapshot } = diffData(snapshotRef.current, { rooms, tenants, transactions, complaints, registrations });
    if (!hasChanges) return undefined;

    const previousSnapshot = snapshotRef.current;
    snapshotRef.current = nextSnapshot;
    inFlightRef.current += 1;
    setSyncState('saving');

    let retryTimer;
    pushChainRef.current = pushChainRef.current
      .then(() => pushChanges(changes))
      .then(() => {
        inFlightRef.current -= 1;
        if (inFlightRef.current === 0) setSyncState('saved');
      })
      .catch((err) => {
        inFlightRef.current -= 1;
        snapshotRef.current = previousSnapshot;
        setSyncState('error');
        if (err instanceof ApiError && err.status === 401) {
          clearSession('Sesi Anda telah kedaluwarsa. Silakan login kembali.');
        } else if (err instanceof ApiError && err.status === 409) {
          setDataStatus('loading');
          setLoadTick(tick => tick + 1);
        } else {
          retryTimer = setTimeout(() => setRetryTick(tick => tick + 1), SYNC_RETRY_MS);
        }
      });

    return () => clearTimeout(retryTimer);
  }, [rooms, tenants, transactions, complaints, registrations, dataStatus, retryTick, clearSession]);

  // Polling perubahan dari server
  useEffect(() => {
    if (dataStatus !== 'ready') return undefined;

    const refresh = async () => {
      if (document.hidden || inFlightRef.current > 0) return;
      try {
        const data = await fetchData();
        const hasLocalEdits = diffData(snapshotRef.current, latestDataRef.current).hasChanges;
        if (inFlightRef.current > 0 || hasLocalEdits || !data.initialized) return;

        const current = buildSnapshot(latestDataRef.current);
        const incoming = buildSnapshot({ ...data, rooms: migrateRoomLocations(data.rooms, data.tenants) });
        const same = Object.keys(current).every(name => {
          const a = current[name];
          const b = incoming[name];
          return a.size === b.size && [...a].every(([id, json]) => b.get(id) === json);
        });
        if (!same) applyServerData(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) clearSession('Sesi Anda telah kedaluwarsa. Silakan login kembali.');
      }
    };

    const timer = setInterval(refresh, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dataStatus, clearSession, applyServerData]);

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const { token, role: accountRole } = await login(loginUser.trim().toLowerCase(), loginPass);
      setToken(token);
      localStorage.setItem('juragankost_role', accountRole);
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      setRole(accountRole);
      setDataStatus('loading');
      setIsAuthenticated(true);
      setActiveTab(ROLE_TABS[accountRole][0]);
      setLoginPass('');
      setLoginErr('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setLoginErr('Username atau kata sandi tidak valid!');
      else if (err instanceof ApiError && err.status !== 0) setLoginErr(err.message);
      else setLoginErr('Tidak dapat terhubung ke server. Coba lagi.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Keluar dari sesi manajemen Kost Tiga A?')) {
      clearSession();
    }
  };

  const handleExport = async ({ name, filename }) => {
    try {
      await downloadExport(name, filename());
      showToast('Ekspor data berhasil diunduh!');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clearSession('Sesi Anda telah kedaluwarsa. Silakan login kembali.');
      else showToast(err instanceof ApiError && err.status !== 0 ? err.message : 'Ekspor gagal: server tidak dapat dihubungi.');
    }
  };

  // Stats
  const { totalRooms, occupiedRooms, availableRooms, maintenanceRooms } = useMemo(() => rooms.reduce((stats, room) => {
    stats.totalRooms += 1;
    if (room.status === 'occupied') stats.occupiedRooms += 1;
    if (room.status === 'available') stats.availableRooms += 1;
    if (room.status === 'maintenance') stats.maintenanceRooms += 1;
    return stats;
  }, { totalRooms: 0, occupiedRooms: 0, availableRooms: 0, maintenanceRooms: 0 }), [rooms]);
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const { totalIncome, totalExpense } = useMemo(() => transactions.reduce((totals, transaction) => {
    if (transaction.type === 'income') totals.totalIncome += Number(transaction.amount);
    if (transaction.type === 'expense') totals.totalExpense += Number(transaction.amount);
    return totals;
  }, { totalIncome: 0, totalExpense: 0 }), [transactions]);

  const netProfit = totalIncome - totalExpense;

  const overdueTenants = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const currentMonthKey = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;

    // Hanya tampilkan penghuni yang statusnya BELUM BAYAR pada bulan berjalan (sysdate)
    const unpaid = tenants.filter(t => !isTenantPaidForMonth(t, currentMonthKey, transactions));

    const mapped = unpaid.map(t => {
      const dueDateThisMonth = computeDueDateForMonth(t, curYear, curMonth);
      const dueObj = new Date(dueDateThisMonth + 'T00:00:00');
      const isOverdue = now > dueObj || t.monthlyStatus?.[currentMonthKey] === 'overdue' || t.paymentStatus === 'overdue';

      return {
        ...t,
        dueDate: dueDateThisMonth,
        effectivePaymentStatus: isOverdue ? 'overdue' : 'pending',
      };
    });

    // Urutkan ascending berdasarkan due date pada bulan sysdate
    mapped.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return mapped;
  }, [tenants, transactions]);

  // Room Actions
  const handleSaveRoom = (roomData) => {
    if (editingRoom) {
      setRooms(rooms.map(r => r.id === roomData.id ? roomData : r));
      showToast(`${getRoomLabel(roomData)} berhasil diperbarui!`);
    } else {
      const newRoom = { ...roomData, id: Date.now().toString(), status: 'available', tenantId: null };
      setRooms([...rooms, newRoom]);
      showToast(`${getRoomLabel(roomData)} berhasil ditambahkan!`);
    }
    setIsRoomModalOpen(false);
    setEditingRoom(null);
  };

  const handleDeleteRoom = (roomId) => {
    const target = rooms.find(r => r.id === roomId);
    if (target?.status === 'occupied') {
      showToast('Kamar yang sedang terisi tidak dapat dihapus!');
      return;
    }
    if (!window.confirm('Yakin ingin menghapus kamar ini?')) return;
    setRooms(rooms.filter(r => r.id !== roomId));
    showToast('Kamar berhasil dihapus!');
  };

  // Tenant Actions
  const handleSaveTenant = (formData) => {
    const isEdit = Boolean(formData.id);
    const targetRoomNumber = String(formData.roomNumber || '');

    if (isEdit) {
      setTenants(prev => prev.map(t => t.id === formData.id ? { ...t, ...formData, roomNumber: targetRoomNumber } : t));
      if (String(targetRoomNumber) !== String(editingTenant?.roomNumber)) {
        setRooms(prev => prev.map(r => {
          if (r.tenantId === formData.id || String(r.number) === String(editingTenant?.roomNumber)) {
            return { ...r, status: 'available', tenantId: null };
          }
          if (String(r.number) === targetRoomNumber) {
            return { ...r, status: 'occupied', tenantId: formData.id };
          }
          return r;
        }));
      }
      showToast('Data penghuni diperbarui!');
    } else {
      const newId = 'T-' + Date.now().toString().slice(-4);
      const newTenant = {
        id: newId,
        name: formData.name,
        phone: formData.phone,
        ktp: formData.ktp,
        roomNumber: targetRoomNumber,
        entryDate: formData.entryDate,
        dueDate: formData.dueDate,
        paymentStatus: formData.paymentStatus,
        deposit: Number(formData.deposit || 0),
        emergencyContact: formData.emergencyContact || '',
      };
      setTenants(prev => [...prev, newTenant]);
      setRooms(prev => prev.map(r => String(r.number) === targetRoomNumber
        ? { ...r, status: 'occupied', tenantId: newId }
        : r
      ));

      if (formData.firstPayment && Number(formData.firstPayment) > 0) {
        const newTrx = {
          date: formData.entryDate || new Date().toISOString().split('T')[0],
          type: 'income',
          category: 'Sewa Kamar',
          amount: Number(formData.firstPayment),
          roomNumber: targetRoomNumber,
          tenantName: formData.name,
          note: `Pembayaran awal sewa & check-in ${getRoomLocation(targetRoomNumber, roomByNumber)}`
        };
        setTransactions(prev => [{ ...newTrx, id: getNextTransactionId(prev) }, ...prev]);
      }

      if (formData.registrationId || editingTenant?.registrationId) {
        const regId = formData.registrationId || editingTenant?.registrationId;
        setRegistrations(prev => prev.map(r => r.id === regId
          ? { ...r, status: 'approved', note: `Check-in di ${getRoomLocation(targetRoomNumber, roomByNumber)}` }
          : r
        ));
      }

      showToast(`✓ Berhasil Check-In! Penghuni ${formData.name} dialokasikan ke ${getRoomLocation(targetRoomNumber, roomByNumber)}.`);
    }

    setIsTenantModalOpen(false);
    setEditingTenant(null);
  };

  const handleCheckoutTenant = (tenant) => {
    setRooms(rooms.map(r => (r.tenantId === tenant.id || String(r.number) === String(tenant.roomNumber)
      ? { ...r, status: 'available', tenantId: null }
      : r)));
    setTenants(tenants.filter(t => t.id !== tenant.id));
    showToast(`Penghuni ${tenant.name} dari ${getRoomLocation(tenant.roomNumber, roomByNumber)} telah check-out.`);
  };

  const handleSendWhatsAppReminder = (tenant, dueDateOverride = null) => {
    const room = roomByNumber.get(String(tenant.roomNumber));
    const nominal = room ? formatRupiah(room.price) : 'Rp 0';
    const targetDue = dueDateOverride || tenant.dueDate;
    const msg = `Halo Kak ${tenant.name},\n\nSalam dari Manajemen Kost Tiga A. Kami ingin menginfokan bahwa sewa ${getRoomLocation(tenant.roomNumber, roomByNumber)} jatuh tempo pada *${formatDate(targetDue)}* sebesar *${nominal}*.\n\nMohon konfirmasi pembayaran jika sudah ditransfer ya. Terima kasih! 🙏`;
    let phone = tenant.phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handlePayBill = (tenant, dueDateForMonth = null) => {
    const room = roomByNumber.get(String(tenant.roomNumber));
    const targetDue = dueDateForMonth || tenant.dueDate;
    setTrxInitialData({
      type: 'income',
      category: 'Sewa Kamar',
      amount: room ? room.price : '',
      roomNumber: tenant.roomNumber,
      tenantName: tenant.name,
      note: `Pembayaran sewa ${getRoomLocation(tenant.roomNumber, roomByNumber)} periode jatuh tempo ${formatDate(targetDue)}`,
      date: new Date().toISOString().split('T')[0],
    });
    setIsTrxModalOpen(true);
  };

  const handleUpdateTenantPaymentStatus = (tenantId, newStatus, monthKey = null) => {
    const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const targetMonth = monthKey || currentMonthKey;
    setTenants(prev => prev.map(t => {
      if (t.id === tenantId) {
        const monthlyStatus = { ...(t.monthlyStatus || {}), [targetMonth]: newStatus };
        return {
          ...t,
          paymentStatus: newStatus,
          lastPaidMonth: newStatus === 'paid' ? targetMonth : (t.lastPaidMonth === targetMonth ? null : t.lastPaidMonth),
          monthlyStatus,
        };
      }
      return t;
    }));
    showToast(`Status tagihan diperbarui menjadi ${newStatus === 'paid' ? 'Lunas' : newStatus === 'overdue' ? 'Telat' : 'Menunggu'}`);
  };

  // Transaction Actions
  const handleSaveTransaction = (trxData) => {
    setTransactions(prev => [
      { ...trxData, id: getNextTransactionId(prev), amount: Number(trxData.amount) },
      ...prev,
    ]);
    if (trxData.type === 'income' && trxData.tenantName) {
      const trxMonth = trxData.date ? trxData.date.slice(0, 7) : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      setTenants(tenants.map(t => {
        if (t.name === trxData.tenantName || String(t.roomNumber) === String(trxData.roomNumber)) {
          const monthlyStatus = { ...(t.monthlyStatus || {}), [trxMonth]: 'paid' };
          return {
            ...t,
            paymentStatus: 'paid',
            lastPaidMonth: trxMonth,
            monthlyStatus,
          };
        }
        return t;
      }));
    }
    setIsTrxModalOpen(false);
    setTrxInitialData(null);
    showToast('Transaksi berhasil dicatat!');
  };

  const handleDeleteTransaction = (trx) => {
    if (!window.confirm(`Hapus transaksi ${trx.id} (${trx.category} - ${formatRupiah(trx.amount)})? Tindakan ini tidak dapat dibatalkan.`)) return;
    setTransactions(prev => prev.filter(t => t.id !== trx.id));
    showToast('Transaksi berhasil dihapus!');
  };

  const handleDownloadReceiptPdf = async () => {
    if (!receiptTrx) return;
    try {
      const { downloadReceiptPdf } = await import('./receiptPdf');
      await downloadReceiptPdf({
        id: receiptTrx.id,
        amount: formatRupiah(receiptTrx.amount),
        rows: [
          ['No. Kuitansi:', receiptTrx.id],
          ['Tanggal Pembayaran:', formatDate(receiptTrx.date)],
          ['Diterima dari:', receiptTrx.tenantName],
          ['Untuk Sewa:', getRoomLocation(receiptTrx.roomNumber, roomByNumber)],
          ['Keterangan:', formatTransactionNote(receiptTrx, roomByNumber)],
        ],
      });
    } catch {
      showToast('Gagal membuat PDF kuitansi.');
    }
  };

  // Complaint Actions
  const handleSaveComplaint = (compData) => {
    const newC = {
      ...compData,
      id: 'CMP-' + (complaints.length + 101),
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      costEst: Number(compData.costEst || 0)
    };
    setComplaints([newC, ...complaints]);
    setIsComplaintModalOpen(false);
    showToast('Laporan keluhan berhasil diajukan!');
  };

  const handleUpdateComplaintStatus = (id, newStatus) => {
    setComplaints(complaints.map(c => c.id === id ? { ...c, status: newStatus } : c));
    showToast(`Status keluhan diperbarui menjadi ${newStatus}`);
  };

  const handleUpdateRegistrationStatus = (id, newStatus) => {
    setRegistrations(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    showToast(`Status pendaftar diubah menjadi ${newStatus === 'approved' ? 'Disetujui' : newStatus === 'rejected' ? 'Ditolak' : 'Menunggu'}`);
  };

  const handleCheckInFromRegistration = (reg) => {
    const regKostLower = (reg.kost || '').toLowerCase();
    const loc = regKostLower.includes('athaya') ? 'athaya' : (regKostLower.includes('alya') ? 'alya' : null);
    const matchedRoom = rooms.find(r => r.status === 'available' && (!loc || r.locationId === loc)) || rooms.find(r => r.status === 'available');

    setEditingTenant({
      name: reg.fullName || '',
      phone: reg.phone || '',
      ktp: reg.nik || '',
      emergencyContact: [reg.guardianName, reg.guardianPhone].filter(Boolean).join(' - '),
      registrationId: reg.id,
      preferredKost: reg.kost || '',
      roomNumber: matchedRoom?.number ? String(matchedRoom.number) : '',
    });
    setIsTenantModalOpen(true);
  };

  const handleDeleteRegistration = (id) => {
    if (window.confirm('Yakin ingin menghapus data pendaftaran ini?')) {
      setRegistrations(prev => prev.filter(r => r.id !== id));
      showToast('Data pendaftar berhasil dihapus');
    }
  };

  // 1. Layar Login
  if (!isAuthenticated) {
    return (
      <LoginView
        username={loginUser}
        setUsername={setLoginUser}
        password={loginPass}
        setPassword={setLoginPass}
        loginError={loginErr}
        isLoggingIn={isLoggingIn}
        onSubmit={handleLogin}
      />
    );
  }

  // 2. Layar Loading / Error
  if (dataStatus !== 'ready') {
    return (
      <StatusScreen
        status={dataStatus}
        message={dataMessage}
        onRetry={() => {
          setDataStatus('loading');
          setLoadTick(tick => tick + 1);
        }}
        onLogout={clearSession}
      />
    );
  }

  // 3. Layar Dashboard Utama
  return (
    <div className="min-h-screen text-slate-800">
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}

      <HeaderNav
        role={role}
        isAdmin={isAdmin}
        allowedTabs={allowedTabs}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        syncState={syncState}
        roomsCount={rooms.length}
        overdueCount={overdueTenants.length}
        pendingRegistrationsCount={pendingRegistrationsCount}
        onExport={handleExport}
        onLogout={handleLogout}
      />

      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-7 md:px-8">
        {isAdmin && activeTab === 'dashboard' && (
          <DashboardView
            occupancyRate={occupancyRate}
            occupiedRooms={occupiedRooms}
            availableRooms={availableRooms}
            maintenanceRooms={maintenanceRooms}
            totalIncome={totalIncome}
            totalExpense={totalExpense}
            netProfit={netProfit}
            overdueTenants={overdueTenants}
            openComplaints={openComplaints}
            roomByNumber={roomByNumber}
            onOpenCheckIn={() => {
              setEditingTenant(null);
              setIsTenantModalOpen(true);
            }}
            onOpenTrxModal={() => {
              setTrxInitialData(null);
              setIsTrxModalOpen(true);
            }}
            onOpenComplaintModal={() => setIsComplaintModalOpen(true)}
            onSelectTab={setActiveTab}
            onSendWhatsAppReminder={handleSendWhatsAppReminder}
          />
        )}

        {activeTab === 'rooms' && (
          <RoomsView
            rooms={rooms}
            tenantByRoom={tenantByRoom}
            roomsPerLocation={roomsPerLocation}
            roomFilterStatus={roomFilterStatus}
            setRoomFilterStatus={setRoomFilterStatus}
            roomFilterLocation={roomFilterLocation}
            setRoomFilterLocation={setRoomFilterLocation}
            onAddRoom={() => {
              setEditingRoom(null);
              setIsRoomModalOpen(true);
            }}
            onEditRoom={(room) => {
              setEditingRoom(room);
              setIsRoomModalOpen(true);
            }}
            onDeleteRoom={handleDeleteRoom}
          />
        )}

        {activeTab === 'tenants' && (
          <TenantsView
            tenants={tenants}
            tenantSearch={tenantSearch}
            setTenantSearch={setTenantSearch}
            roomByNumber={roomByNumber}
            onAddTenant={() => {
              setEditingTenant(null);
              setIsTenantModalOpen(true);
            }}
            onEditTenant={(tenant) => {
              setEditingTenant(tenant);
              setIsTenantModalOpen(true);
            }}
            onCheckoutTenant={handleCheckoutTenant}
            onSendWhatsAppReminder={handleSendWhatsAppReminder}
          />
        )}

        {activeTab === 'bills' && (
          <BillsView
            tenants={tenants}
            roomByNumber={roomByNumber}
            transactions={transactions}
            onSendWhatsAppReminder={handleSendWhatsAppReminder}
            onPayBill={handlePayBill}
            onUpdatePaymentStatus={handleUpdateTenantPaymentStatus}
            onSelectReceipt={setReceiptTrx}
            onAddTransaction={() => {
              setTrxInitialData(null);
              setIsTrxModalOpen(true);
            }}
          />
        )}

        {isAdmin && activeTab === 'finance' && (
          <FinanceView
            transactions={transactions}
            totalIncome={totalIncome}
            totalExpense={totalExpense}
            netProfit={netProfit}
            roomByNumber={roomByNumber}
            onAddTransaction={() => {
              setTrxInitialData(null);
              setIsTrxModalOpen(true);
            }}
            onSelectReceipt={setReceiptTrx}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}

        {activeTab === 'complaints' && (
          <ComplaintsView
            complaints={complaints}
            roomByNumber={roomByNumber}
            onOpenComplaintModal={() => setIsComplaintModalOpen(true)}
            onUpdateComplaintStatus={handleUpdateComplaintStatus}
          />
        )}

        {activeTab === 'registrations' && (
          <RegistrationsView
            registrations={registrations}
            onUpdateStatus={handleUpdateRegistrationStatus}
            onCheckInFromRegistration={handleCheckInFromRegistration}
            onDeleteRegistration={handleDeleteRegistration}
          />
        )}
      </main>

      {/* Modals */}
      <RoomModal
        key={isRoomModalOpen ? (editingRoom?.id || 'new-room') : 'closed'}
        isOpen={isRoomModalOpen}
        onClose={() => {
          setIsRoomModalOpen(false);
          setEditingRoom(null);
        }}
        editingRoom={editingRoom}
        onSave={handleSaveRoom}
      />

      <TenantModal
        key={isTenantModalOpen ? (editingTenant?.id || 'new-tenant') : 'closed'}
        isOpen={isTenantModalOpen}
        onClose={() => {
          setIsTenantModalOpen(false);
          setEditingTenant(null);
        }}
        editingTenant={editingTenant}
        rooms={rooms}
        roomByNumber={roomByNumber}
        onSave={handleSaveTenant}
      />

      <TransactionModal
        key={isTrxModalOpen ? (trxInitialData ? `${trxInitialData.tenantName}-${trxInitialData.roomNumber}` : 'empty-trx') : 'closed'}
        isOpen={isTrxModalOpen}
        onClose={() => {
          setIsTrxModalOpen(false);
          setTrxInitialData(null);
        }}
        rooms={rooms}
        roomByNumber={roomByNumber}
        initialData={trxInitialData}
        onSave={handleSaveTransaction}
      />

      <ComplaintModal
        isOpen={isComplaintModalOpen}
        onClose={() => setIsComplaintModalOpen(false)}
        rooms={rooms}
        roomByNumber={roomByNumber}
        onSave={handleSaveComplaint}
      />

      <ReceiptModal
        receiptTrx={receiptTrx}
        roomByNumber={roomByNumber}
        onClose={() => setReceiptTrx(null)}
        onDownloadPdf={handleDownloadReceiptPdf}
      />
    </div>
  );
}
