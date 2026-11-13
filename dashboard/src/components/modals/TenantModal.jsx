import Modal from '../common/Modal';
import { formatRupiah, getRoomLocation, getRoomTypeLabel } from '../../utils/formatters';

export default function TenantModal({
  isOpen,
  onClose,
  editingTenant,
  rooms,
  roomByNumber,
  onSave,
}) {
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    onSave({
      id: editingTenant?.id || null,
      name: fd.get('name'),
      phone: fd.get('phone'),
      ktp: fd.get('ktp'),
      roomNumber: fd.get('roomNumber'),
      entryDate: fd.get('entryDate'),
      dueDate: fd.get('dueDate'),
      paymentStatus: fd.get('paymentStatus'),
      deposit: Number(fd.get('deposit')),
      emergencyContact: fd.get('emergencyContact'),
      firstPayment: fd.get('firstPayment')
    });
  };

  const title = editingTenant ? 'Edit Data Penghuni' : 'Form Check-In Penghuni Baru';

  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
            <label className="text-xs font-semibold text-slate-600 block mb-1">Pilih Kamar</label>
            <select
              name="roomNumber"
              defaultValue={editingTenant?.roomNumber || ''}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            >
              {editingTenant && (
                <option value={editingTenant.roomNumber}>
                  {getRoomLocation(editingTenant.roomNumber, roomByNumber)} (Saat Ini)
                </option>
              )}
              {rooms.filter(r => r.status === 'available').map(r => (
                <option key={r.id} value={r.number}>
                  {getRoomLocation(r.number, roomByNumber)} ({getRoomTypeLabel(r.type)} - {formatRupiah(r.price)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Uang Deposit (Rp)</label>
            <input
              type="number"
              name="deposit"
              defaultValue={editingTenant?.deposit || 500000}
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
              defaultValue={editingTenant?.entryDate || new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tanggal Jatuh Tempo</label>
            <input
              type="date"
              required
              name="dueDate"
              defaultValue={editingTenant?.dueDate || ''}
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
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
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

        {!editingTenant && (
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
            <label className="text-xs font-bold text-blue-900 block mb-1">Pembayaran Pertama Masuk (Otomatis Masuk Kas)</label>
            <input
              type="number"
              name="firstPayment"
              placeholder="1500000"
              defaultValue={1500000}
              className="w-full px-3 py-2 text-sm bg-white border border-blue-200 rounded-lg focus:outline-none"
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
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow cursor-pointer"
          >
            Simpan & Check-In
          </button>
        </div>
      </form>
    </Modal>
  );
}

