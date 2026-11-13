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

