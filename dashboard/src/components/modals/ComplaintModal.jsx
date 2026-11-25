import Modal from '../common/Modal';
import { getRoomLocation } from '../../utils/formatters';

export default function ComplaintModal({
  isOpen,
  onClose,
  rooms,
  roomByNumber,
  onSave,
}) {
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    onSave({
      roomNumber: fd.get('roomNumber'),
      tenantName: fd.get('tenantName'),
      issue: fd.get('issue'),
      priority: fd.get('priority'),
      costEst: fd.get('costEst')
    });
  };

  return (
    <Modal title="Buat Laporan Keluhan / Kerusakan" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nomor Kamar</label>
            <select
              required
              name="roomNumber"
              defaultValue=""
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            >
              <option value="" disabled>Pilih lokasi dan kamar</option>
              {rooms.map(room => (
                <option key={room.id} value={room.number}>{getRoomLocation(room.number, roomByNumber)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nama Pelapor</label>
            <input
              required
              name="tenantName"
              placeholder="Nama anak kost"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">Kendala / Keluhan Kerusakan</label>
          <textarea
            required
            name="issue"
            rows={3}
            placeholder="Misal: Keran air bocor menetes terus..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Prioritas</label>
            <select
              name="priority"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            >
              <option value="Sedang">Sedang</option>
              <option value="Tinggi">Tinggi (Mendesak)</option>
              <option value="Rendah">Rendah</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Estimasi Biaya Servis (Rp)</label>
            <input
              type="number"
              name="costEst"
              defaultValue={50000}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-3 flex gap-2 justify-end">
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
            Simpan Laporan
          </button>
        </div>
      </form>
    </Modal>
  );
}

