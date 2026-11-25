import { useState } from 'react';
import Modal from '../common/Modal';
import {
  LOCATION_NAMES,
  LOCATION_PREFIXES,
  ROOM_FACILITIES,
  PREDEFINED_FACILITIES,
} from '../../constants/kost';
import { getRoomDisplayNumber, getRoomTypeLabel } from '../../utils/formatters';
import { FacilityIcon } from '../common/FacilityBadge';
import { Check } from 'lucide-react';

const normalizeFacilities = (list) => {
  if (!Array.isArray(list)) return [];
  const result = [];
  let hasKasur = false;
  let hasBantalGuling = false;

  for (const item of list) {
    const s = String(item).trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    if (lower === 'kasur, bantal & guling') {
      hasKasur = true;
      hasBantalGuling = true;
    } else if (lower === 'kasur') {
      hasKasur = true;
    } else if (lower === 'bantal & guling') {
      hasBantalGuling = true;
    } else {
      result.push(s);
    }
  }

  if (hasKasur || hasBantalGuling) {
    result.push('Kasur, bantal & guling');
  }

  return result;
};

export default function RoomModal({ isOpen, onClose, editingRoom, onSave }) {
  const initialType = editingRoom?.type
    ? (getRoomTypeLabel(editingRoom.type) === 'NON AC' ? 'Non-AC' : 'AC')
    : 'AC';

  const [selectedType, setSelectedType] = useState(initialType);
  const [selectedFacilities, setSelectedFacilities] = useState(() => {
    if (Array.isArray(editingRoom?.facilities) && editingRoom.facilities.length > 0) {
      return normalizeFacilities(editingRoom.facilities);
    }
    return [...(PREDEFINED_FACILITIES[initialType] || PREDEFINED_FACILITIES.AC)];
  });

  if (!isOpen) return null;

  const isFacilityActive = (name) => {
    const target = name.toLowerCase();
    return selectedFacilities.some(item => {
      const it = item.toLowerCase();
      return it === target || (target === 'ac' && it === 'ac') || (target.includes('wifi') && it.includes('wifi'));
    });
  };

  const toggleFacility = (facilityName) => {
    const target = facilityName.toLowerCase();
    setSelectedFacilities(prev => {
      const exists = prev.some(item => {
        const it = item.toLowerCase();
        return it === target || (target === 'ac' && it === 'ac') || (target.includes('wifi') && it.includes('wifi'));
      });

      if (exists) {
        return prev.filter(item => {
          const it = item.toLowerCase();
          return it !== target && !(target === 'ac' && it === 'ac') && !(target.includes('wifi') && it.includes('wifi'));
        });
      } else {
        return [...prev, facilityName];
      }
    });
  };

  const handleTypeChange = (newType) => {
    setSelectedType(newType);
    setSelectedFacilities(prev => {
      if (newType === 'AC') {
        return prev.some(f => f.toLowerCase() === 'ac') ? prev : ['AC', ...prev];
      } else {
        return prev.filter(f => f.toLowerCase() !== 'ac');
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    onSave({
      id: editingRoom ? editingRoom.id : Date.now().toString(),
      number: editingRoom
        ? editingRoom.number
        : `${LOCATION_PREFIXES[fd.get('locationId')]}${String(fd.get('number')).trim().padStart(2, '0')}`,
      locationId: editingRoom?.locationId || fd.get('locationId'),
      type: selectedType,
      price: Number(fd.get('price')),
      status: editingRoom ? editingRoom.status : 'available',
      tenantId: editingRoom ? editingRoom.tenantId : null,
      facilities: selectedFacilities,
    });
  };

  const title = editingRoom ? `Edit Kamar ${getRoomDisplayNumber(editingRoom.number)}` : 'Tambah Kamar Kost Baru';

  // Fasilitas yang relevan sesuai tipe kamar
  const availableFacilities = ROOM_FACILITIES.filter(
    (facility) => selectedType === 'AC' || facility.id !== 'ac'
  );

  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nomor Kamar</label>
            <input
              required
              name="number"
              defaultValue={editingRoom ? getRoomDisplayNumber(editingRoom.number) : ''}
              placeholder="Contoh: 01"
              readOnly={Boolean(editingRoom)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Lokasi Kost</label>
            <select
              name="locationId"
              defaultValue={editingRoom?.locationId || 'athaya'}
              disabled={Boolean(editingRoom)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none"
            >
              {Object.entries(LOCATION_NAMES).map(([locationId, locationName]) => (
                <option key={locationId} value={locationId}>{locationName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tipe Kamar</label>
            <select
              required
              name="type"
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none font-medium"
            >
              <option value="AC">AC</option>
              <option value="Non-AC">Non-AC</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tarif Sewa Per Bulan (Rp)</label>
            <input
              required
              type="number"
              name="price"
              defaultValue={editingRoom ? editingRoom.price : ''}
              placeholder="Misal: 1500000"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none font-bold"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700 block">Pilihan Fasilitas Kamar</label>
            <span className="text-[11px] text-slate-400">
              {selectedFacilities.length} dari {availableFacilities.length} fasilitas aktif
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
            {availableFacilities.map((facility) => {
              const active = isFacilityActive(facility.name);
              return (
                <button
                  key={facility.id}
                  type="button"
                  onClick={() => toggleFacility(facility.name)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl text-left border transition-all cursor-pointer ${
                    active
                      ? 'bg-[#eeeadf] border-[#bca878] text-[#1f3028] shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                    active
                      ? 'bg-[#d8c391] text-[#1f3028] border border-[#bca878]'
                      : 'bg-[#eeeadf] text-[#526b5b] border border-slate-200'
                  }`}>
                    <FacilityIcon name={facility.name} className={`w-4 h-4 ${active ? 'text-[#1f3028]' : 'text-[#526b5b]'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold leading-tight ${active ? 'text-[#1f3028]' : 'text-slate-800'}`}>
                        {facility.name}
                      </p>
                      {active && <Check className="w-4 h-4 text-[#1f3028] shrink-0 ml-1" />}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-tight">{facility.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-3 flex gap-2 justify-end border-t border-slate-100">
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
            Simpan Kamar
          </button>
        </div>
      </form>
    </Modal>
  );
}
