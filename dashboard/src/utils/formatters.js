import { LOCATION_NAMES } from '../constants/kost';

export const formatRupiah = (number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(number || 0);
};

export const getRoomTypeLabel = (type) => {
  switch (type) {
    case 'ac': return 'AC';
    case 'non_ac': return 'Non-AC';
    default: return type ? type.toUpperCase() : '-';
  }
};

export const getRoomDisplayNumber = (roomNumber) => String(roomNumber).slice(-2).padStart(2, '0');

export const getRoomLabel = (room) => {
  if (!room) return 'Kamar -';
  return `${LOCATION_NAMES[room.locationId] || 'Kost'} - Kamar ${getRoomDisplayNumber(room.number)}`;
};

export const formatDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (value || '-');
};

export const getRoomLocation = (roomNumber, roomsByNumber) => {
  const room = roomsByNumber.get(String(roomNumber));
  if (!room) return `Kamar ${getRoomDisplayNumber(roomNumber)}`;
  return getRoomLabel(room);
};

export const formatTransactionNote = (trx, roomsByNumber) => {
  if (!trx.note || !trx.roomNumber || trx.roomNumber === '-') return trx.note || '-';
  const raw = String(trx.roomNumber);
  const pattern = new RegExp(`kamar ${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`, 'i');
  return trx.note.replace(pattern, getRoomLocation(raw, roomsByNumber));
};

export const getNextTransactionId = (transactions) => {
  const highestId = transactions.reduce((highest, transaction) => {
    const match = /^TRX-(\d+)$/.exec(String(transaction.id));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `TRX-${String(highestId + 1).padStart(5, '0')}`;
};

export const computeDueDateForMonth = (tenant, year, month) => {
  const base = tenant?.dueDate || tenant?.entryDate || '2026-01-01';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(base));
  const dayNum = match ? parseInt(match[3], 10) : 1;
  const maxDays = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, dayNum), maxDays);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
};

export const isTenantPaidForMonth = (tenant, monthKey, transactions = []) => {
  if (!tenant) return false;

  // 1. Status spesifik bulan ini yang diupdate admin
  if (tenant.monthlyStatus?.[monthKey] === 'paid') return true;
  if (tenant.lastPaidMonth === monthKey) return true;
  if (tenant.monthlyStatus?.[monthKey] === 'pending' || tenant.monthlyStatus?.[monthKey] === 'overdue') {
    return false;
  }

  // 2. Transaksi pemasukan sewa kamar di bulan ini
  const hasIncomeTrx = transactions.some(
    (trx) =>
      trx.type === 'income' &&
      (trx.category === 'Sewa Kamar' || !trx.category) &&
      trx.date?.startsWith(monthKey) &&
      (trx.tenantName === tenant.name || String(trx.roomNumber) === String(tenant.roomNumber))
  );
  if (hasIncomeTrx) return true;

  // 3. Status dasar tenant adalah 'paid' pada bulan yang sama atau siklus sewa aktif
  if (tenant.paymentStatus === 'paid') {
    if (!tenant.dueDate || tenant.dueDate.startsWith(monthKey) || !tenant.lastPaidMonth) {
      return true;
    }
  }

  return false;
};

