import {
  EMPTY_DATA_VERSION,
  INITIAL_ROOMS,
  INITIAL_TENANTS,
  INITIAL_TRANSACTIONS,
  INITIAL_COMPLAINTS,
  PREDEFINED_FACILITIES,
} from '../constants/kost';

export const normalizeFacilities = (list) => {
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

export const migrateRoomLocations = (savedRooms, savedTenants = []) => {
  const tenantIds = new Set(savedTenants.map(tenant => tenant.id));
  return savedRooms.map(room => {
    const isAC = String(room.type).toLowerCase() === 'ac';
    const defaultFacilities = isAC ? PREDEFINED_FACILITIES.AC : PREDEFINED_FACILITIES['Non-AC'];
    const facilities = (Array.isArray(room.facilities) && room.facilities.length > 0)
      ? normalizeFacilities(room.facilities)
      : defaultFacilities;

    const migrated = {
      ...room,
      locationId: room.locationId || ({ 1: 'athaya', 2: 'alya', 3: 'andayani' })[room.floor] || 'athaya',
      facilities,
    };
    // Kamar yang menunjuk penghuni yang sudah tidak ada dikembalikan menjadi kosong.
    return migrated.tenantId && !tenantIds.has(migrated.tenantId)
      ? { ...migrated, status: 'available', tenantId: null }
      : migrated;
  });
};

export const resetDataToZero = () => {
  if (localStorage.getItem('juragankost_empty_data_version') === EMPTY_DATA_VERSION) return;

  localStorage.setItem('juragankost_rooms', JSON.stringify(INITIAL_ROOMS));
  localStorage.setItem('juragankost_tenants', '[]');
  localStorage.setItem('juragankost_trx', '[]');
  localStorage.setItem('juragankost_complaints', '[]');
  localStorage.setItem('juragankost_empty_data_version', EMPTY_DATA_VERSION);
};

export const readLocalData = () => {
  resetDataToZero();
  const read = (key, fallback) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch {
      return fallback;
    }
  };

  const tenants = read('juragankost_tenants', INITIAL_TENANTS);
  const rooms = migrateRoomLocations(read('juragankost_rooms', INITIAL_ROOMS), tenants);
  return {
    rooms,
    tenants,
    transactions: read('juragankost_trx', INITIAL_TRANSACTIONS),
    complaints: read('juragankost_complaints', INITIAL_COMPLAINTS),
  };
};
