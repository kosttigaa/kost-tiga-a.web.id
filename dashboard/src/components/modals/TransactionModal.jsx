import Modal from '../common/Modal';
import { getRoomLocation } from '../../utils/formatters';

export default function TransactionModal({
  isOpen,
  onClose,
  rooms,
  roomByNumber,
  initialData = null,
  onSave,
}) {
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    onSave({
      date: fd.get('date'),
      type: fd.get('type'),
      category: fd.get('category'),
      amount: fd.get('amount'),
      roomNumber: fd.get('roomNumber') || '-',
      tenantName: fd.get('tenantName') || '-',
      note: fd.get('note')
    });
  };

  return (
    <Modal title="Catat Pemasukan / Pengeluaran" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Jenis Transaksi</label>
            <select
              name="type"
              defaultValue={initialData?.type || 'income'}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none font-medium"
            >
              <option value="income">🟢 Pemasukan (+)</option>
              <option value="expense">🔴 Pengeluaran (-)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tanggal</label>
            <input
              type="date"
              required
              name="date"
              defaultValue={initialData?.date || new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Kategori Transaksi</label>
          <select
            name="category"
            defaultValue={initialData?.category || 'Sewa Kamar'}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
          >
            <option value="Sewa Kamar">Sewa Kamar Bulanan</option>
            <option value="Denda Keterlambatan">Denda Keterlambatan</option>
            <option value="Listrik & Air">Listrik & Air Bersih</option>
            <option value="Internet/WiFi">Langganan Internet / WiFi</option>
            <option value="Perbaikan">Biaya Servis & Perbaikan Gedung</option>
            <option value="Kebersihan & Sampah">Iuran Sampah & Kebersihan</option>
            <option value="Lainnya">Operasional Lainnya</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Nominal (Rp)</label>
          <input
            required
            type="number"
            name="amount"
            defaultValue={initialData?.amount || ''}
            placeholder="Misal: 1500000"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none font-bold"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nomor Kamar (Opsional)</label>
            <select
              name="roomNumber"
              defaultValue={initialData?.roomNumber ? String(initialData.roomNumber) : '-'}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            >
              <option value="-">Umum</option>
              {rooms.map(room => (
                <option key={room.id} value={room.number}>{getRoomLocation(room.number, roomByNumber)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nama Penghuni (Opsional)</label>
            <input
              name="tenantName"
              defaultValue={initialData?.tenantName || ''}
              placeholder="Nama penyewa"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Keterangan / Catatan</label>
          <textarea
            name="note"
            rows={2}
            defaultValue={initialData?.note || ''}
            placeholder="Keterangan rincian pembayaran..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
          />
        </div>

        <div className="pt-2 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial justify-center px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            className="flex-1 sm:flex-initial justify-center px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow cursor-pointer"
          >
            Simpan Transaksi
          </button>
        </div>
      </form>
    </Modal>
  );
}

