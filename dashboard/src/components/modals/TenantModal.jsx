import { useState, useMemo } from 'react';
import Modal from '../common/Modal';
import { formatRupiah, getRoomLocation, getRoomTypeLabel } from '../../utils/formatters';

export default function TenantModal({
  isOpen,
  onClose,
  editingTenant,
  rooms = [],
  roomByNumber,
  onSave,
}) {
  const isEditing = Boolean(editingTenant?.id);
  const isFromRegistration = Boolean(editingTenant?.registrationId);

  // Kamar yang tersedia
  const availableRooms = useMemo(() => rooms.filter(r => r.status === 'available'), [rooms]);

  // Pilih kamar awal yang sesuai
  const initialRoomNumber = useMemo(() => {
    if (isEditing && editingTenant?.roomNumber) return String(editingTenant.roomNumber);
    if (editingTenant?.roomNumber) return String(editingTenant.roomNumber);

    // Prioritaskan kamar yang cocok dengan kost yang dipilih saat mendaftar
    if (editingTenant?.preferredKost) {
      const prefLower = editingTenant.preferredKost.toLowerCase();
      const loc = prefLower.includes('athaya') ? 'athaya' : prefLower.includes('alya') ? 'alya' : null;
      if (loc) {
        const match = availableRooms.find(r => r.locationId === loc);
        if (match) return String(match.number);
      }
    }

    return availableRooms[0]?.number ? String(availableRooms[0].number) : '';
  }, [isEditing, editingTenant, availableRooms]);

  const [selectedRoomNumber, setSelectedRoomNumber] = useState(initialRoomNumber);

  const selectedRoomObj = useMemo(() => {
    return roomByNumber?.get(String(selectedRoomNumber)) || availableRooms.find(r => String(r.number) === String(selectedRoomNumber));
  }, [selectedRoomNumber, roomByNumber, availableRooms]);

  const [firstPayment, setFirstPayment] = useState(() => selectedRoomObj?.price || 1200000);

  if (!isOpen) return null;

  const handleRoomChange = (e) => {
    const val = e.target.value;
    setSelectedRoomNumber(val);
    const rm = roomByNumber?.get(String(val)) || availableRooms.find(r => String(r.number) === String(val));
    if (rm?.price) {
      setFirstPayment(rm.price);
    }
  };

  const defaultEntryDate = editingTenant?.entryDate || new Date().toISOString().split('T')[0];
  const defaultDueDate = editingTenant?.dueDate || (() => {
    const d = new Date(defaultEntryDate);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const chosenRoom = fd.get('roomNumber') || selectedRoomNumber;

    if (!chosenRoom) {
      alert('Pilih nomor kamar terlebih dahulu!');
      return;
    }

    onSave({
      id: isEditing ? editingTenant.id : null,
      registrationId: editingTenant?.registrationId || null,
      name: fd.get('name'),
      phone: fd.get('phone'),
      ktp: fd.get('ktp'),
      roomNumber: chosenRoom,
      entryDate: fd.get('entryDate'),
      dueDate: fd.get('dueDate'),
      paymentStatus: fd.get('paymentStatus'),
      deposit: Number(fd.get('deposit') || 0),
      emergencyContact: fd.get('emergencyContact') || '',
      firstPayment: fd.get('firstPayment') || firstPayment,
    });
  };

  const title = isEditing
    ? 'Edit Data Penghuni'
    : isFromRegistration
    ? 'Form Check-In dari Pendaftaran Online'
    : 'Form Check-In Penghuni Baru';

  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {isFromRegistration && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
            <span className="font-bold">Calon Penghuni Terdaftar:</span> {editingTenant.name}
            {editingTenant.preferredKost && (
              <span className="ml-1 inline-block px-2 py-0.5 rounded-full bg-emerald-100 font-bold text-emerald-800 border border-emerald-200">
                Pilihan: {editingTenant.preferredKost}
              </span>
            )}
            <p className="text-[11px] text-emerald-700 mt-1">
              Pilih kamar kosong di bawah. Sistem akan otomatis memasukkan data ke Penghuni, mengubah status Kamar jadi Terisi, dan mencatat mutasi awal di Keuangan.
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Nama Lengkap Penghuni</label>
          <input
            required
            name="name"
            defaultValue={editingTenant?.name || ''}
            placeholder="Misal: Bagas Saputra"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nomor WhatsApp / HP</label>
            <input
              required
              name="phone"
              defaultValue={editingTenant?.phone || ''}
              placeholder="0812xxxxxxxx"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">No. KTP / NIK</label>
            <input
              required
              name="ktp"
              defaultValue={editingTenant?.ktp || ''}
              placeholder="16 digit NIK KTP"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Pilih Kamar Kosong</label>
            <select
              name="roomNumber"
              required
              value={selectedRoomNumber}
              onChange={handleRoomChange}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="" disabled>-- Pilih Kamar --</option>
              {isEditing && (
                <option value={editingTenant.roomNumber}>
                  {getRoomLocation(editingTenant.roomNumber, roomByNumber)} (Saat Ini)
                </option>
              )}
              {availableRooms.length === 0 && !isEditing ? (
                <option value="" disabled>Semua kamar penuh</option>
              ) : (
                availableRooms.map(r => (
                  <option key={r.id} value={r.number}>
                    {getRoomLocation(r.number, roomByNumber)} ({getRoomTypeLabel(r.type)} - {formatRupiah(r.price)})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Uang Deposit (Rp)</label>
            <input
              type="number"
              name="deposit"
              defaultValue={editingTenant?.deposit ?? 500000}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tanggal Masuk</label>
            <input
              type="date"
              required
              name="entryDate"
              defaultValue={defaultEntryDate}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tanggal Jatuh Tempo</label>
            <input
              type="date"
              required
              name="dueDate"
              defaultValue={defaultDueDate}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Status Pembayaran</label>
            <select
              name="paymentStatus"
              defaultValue={editingTenant?.paymentStatus || 'paid'}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="paid">Lunas (Sudah Bayar)</option>
              <option value="pending">Menunggu Transfer</option>
              <option value="overdue">Belum Bayar (Nunggak)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Kontak Darurat / Ortu</label>
            <input
              name="emergencyContact"
              defaultValue={editingTenant?.emergencyContact || ''}
              placeholder="0812... (Orang Tua)"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        {!isEditing && (
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-blue-900">
                Pembayaran Pertama Masuk (Otomatis Masuk Kas)
              </label>
              {selectedRoomObj && (
                <span className="text-[11px] text-blue-700 font-semibold">
                  Tarif sewa: {formatRupiah(selectedRoomObj.price)}
                </span>
              )}
            </div>
            <input
              type="number"
              name="firstPayment"
              value={firstPayment}
              onChange={(e) => setFirstPayment(e.target.value)}
              placeholder="1200000"
              className="w-full px-3 py-2 text-sm bg-white border border-blue-200 rounded-lg focus:outline-none font-semibold text-blue-950"
            />
          </div>
        )}

        <div className="pt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-[#1f3028] text-white text-sm font-bold rounded-xl hover:bg-[#354c3f] shadow cursor-pointer transition-colors"
          >
            Simpan & Check-In
          </button>
        </div>
      </form>
    </Modal>
  );
}
