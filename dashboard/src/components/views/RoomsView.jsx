import { Plus, Filter, Edit, Trash2, BedDouble } from 'lucide-react';
import { LOCATION_NAMES } from '../../constants/kost';
import FacilityBadge from '../common/FacilityBadge';
import {
  formatRupiah,
  formatDate,
  getRoomDisplayNumber,
  getRoomTypeLabel,
} from '../../utils/formatters';

export default function RoomsView({
  rooms,
  tenantByRoom,
  roomsPerLocation,
  roomFilterStatus,
  setRoomFilterStatus,
  roomFilterLocation,
  setRoomFilterLocation,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
}) {
  const filteredRooms = rooms
    .filter(r => roomFilterStatus === 'all' || r.status === roomFilterStatus)
    .filter(r => roomFilterLocation === 'all' || r.locationId === roomFilterLocation);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#526b5b] mb-1">
            ADMINISTRASI SITUS
          </p>
          <h1 className="text-[26px] sm:text-[32px] font-extrabold text-[#242d29] font-heading tracking-[-0.025em] leading-tight">
            Kamar
          </h1>
          <p className="text-[14px] text-[#6d716a] mt-1">
            Kelola inventaris kamar, tarif sewa bulanan, dan fasilitas kost.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRoom}
          className="min-h-[42px] px-4 bg-[#354c3f] hover:bg-[#1f3028] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Tambah Kamar Baru
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Filter className="w-4 h-4" /> Filter:
          </div>
          <select
            value={roomFilterStatus}
            onChange={(e) => setRoomFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none"
          >
            <option value="all">Semua Status</option>
            <option value="available">Tersedia / Kosong</option>
            <option value="occupied">Terisi</option>
            <option value="maintenance">Dalam Perbaikan</option>
          </select>

          <select
            value={roomFilterLocation}
            onChange={(e) => setRoomFilterLocation(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none"
          >
            <option value="all">Semua Lokasi</option>
            <option value="athaya">{LOCATION_NAMES.athaya} ({roomsPerLocation.athaya || 0} kamar)</option>
            <option value="alya">{LOCATION_NAMES.alya} ({roomsPerLocation.alya || 0} kamar)</option>
            <option value="andayani">{LOCATION_NAMES.andayani} ({roomsPerLocation.andayani || 0} kamar)</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Menampilkan <strong className="text-slate-800">{filteredRooms.length}</strong> dari {rooms.length} kamar
        </div>
      </div>

      {filteredRooms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <BedDouble className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold text-sm">Tidak ada kamar yang sesuai filter</p>
          <p className="text-slate-400 text-xs mt-1">Coba ubah filter status atau lokasi kost.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredRooms.map((room) => {
            const occupant = tenantByRoom.get(String(room.number));
            const statusConfig = {
              occupied: {
                card: 'bg-rose-50/70 border-rose-200/80 hover:border-rose-300',
                headerBorder: 'border-rose-100',
                badge: 'bg-rose-100 text-rose-800 border-rose-300',
                label: 'Terisi',
                footer: 'bg-rose-100/40 border-rose-200/60',
                occupantBox: 'bg-white/85 border-rose-200/80 shadow-xs',
              },
              available: {
                card: 'bg-emerald-50/70 border-emerald-200/80 hover:border-emerald-300',
                headerBorder: 'border-emerald-100',
                badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                label: 'Kosong',
                footer: 'bg-emerald-100/40 border-emerald-200/60',
                occupantBox: '',
              },
              maintenance: {
                card: 'bg-amber-50/70 border-amber-200/80 hover:border-amber-300',
                headerBorder: 'border-amber-100',
                badge: 'bg-amber-100 text-amber-800 border-amber-300',
                label: 'Maintenance',
                footer: 'bg-amber-100/40 border-amber-200/60',
                occupantBox: '',
              },
            }[room.status] || {
              card: 'bg-white border-slate-200/80 hover:border-slate-300',
              headerBorder: 'border-slate-100',
              badge: 'bg-slate-100 text-slate-700 border-slate-200',
              label: room.status,
              footer: 'bg-slate-50 border-slate-100',
              occupantBox: '',
            };

            return (
              <div
                key={room.id}
                className={`${statusConfig.card} rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition flex flex-col justify-between`}
              >
                <div>
                  <div className={`p-4 border-b ${statusConfig.headerBorder} flex items-center justify-between`}>
                    <div>
                      <span className="text-xs font-bold text-slate-400">{LOCATION_NAMES[room.locationId] || 'Kost'}</span>
                      <h3 className="text-xl font-bold text-slate-900">Kamar {getRoomDisplayNumber(room.number)}</h3>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${statusConfig.badge}`}
                    >
                      {statusConfig.label}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-xs text-slate-400">Tipe & Harga Sewa</p>
                      <p className="text-sm font-semibold text-slate-800">{getRoomTypeLabel(room.type)}</p>
                      <p className="text-base font-bold text-indigo-600">
                        {formatRupiah(room.price)}
                        <span className="text-xs text-slate-400 font-normal">/bulan</span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-400 mb-1.5">Fasilitas:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {room.facilities.length > 0 ? (
                          room.facilities.map((fac, idx) => (
                            <FacilityBadge key={idx} name={fac} />
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Belum diisi</span>
                        )}
                      </div>
                    </div>

                    {room.status === 'occupied' && occupant && (
                      <div className={`mt-3 p-3 ${statusConfig.occupantBox} rounded-xl border`}>
                        <p className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">Penghuni Aktif:</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{occupant.name}</p>
                        <p className="text-xs text-slate-500">Jatuh Tempo: {formatDate(occupant.dueDate)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className={`p-3 ${statusConfig.footer} border-t flex items-center justify-between`}>
                  <button
                    type="button"
                    onClick={() => onEditRoom(room)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRoom(room.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

