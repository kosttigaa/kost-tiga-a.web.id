export const ROLE_LABELS = { admin: 'Admin', penjaga: 'Penjaga' };

export const EXPORT_OPTIONS = [
  { name: 'database', label: 'Database SQLite (.db)', filename: () => `kost-tiga-a-${new Date().toISOString().slice(0, 10)}.db` },
  { name: 'rooms.xlsx', label: 'Kamar (.xlsx)', filename: () => 'kamar.xlsx' },
  { name: 'tenants.xlsx', label: 'Penghuni (.xlsx)', filename: () => 'penghuni.xlsx' },
  { name: 'transactions.xlsx', label: 'Keuangan (.xlsx)', filename: () => 'keuangan.xlsx' },
  { name: 'complaints.xlsx', label: 'Keluhan (.xlsx)', filename: () => 'keluhan.xlsx' },
  { name: 'registrations.xlsx', label: 'Pendaftar (.xlsx)', filename: () => 'pendaftar.xlsx' },
];

export const SYNC_INTERVAL_MS = 15000;
export const SYNC_RETRY_MS = 5000;
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 menit tidak ada aktivitas
export const LAST_ACTIVITY_KEY = 'juragankost_last_activity';

export const ROLE_TABS = {
  admin: ['dashboard', 'rooms', 'tenants', 'finance', 'complaints', 'registrations'],
  penjaga: ['rooms', 'tenants', 'complaints', 'registrations'],
};

export const LOCATION_NAMES = {
  athaya: 'Kost Putri: Athaya',
  alya: 'Kost Putri: Alya',
  andayani: 'Kost Putri: Andayani',
};

export const LOCATION_PREFIXES = { athaya: '1', alya: '2', andayani: '3' };

export const EMPTY_DATA_VERSION = '1';

// Fasilitas default berdasarkan tipe kamar
export const PREDEFINED_FACILITIES = {
  AC: [
    'AC',
    'Kamar mandi dalam',
    'Kasur, bantal & guling',
    'Meja & Kursi',
    'Lemari pakaian',
    'Wifi / Internet',
  ],
  'Non-AC': [
    'Kamar mandi dalam',
    'Kasur, bantal & guling',
    'Meja & Kursi',
    'Lemari pakaian',
    'Wifi / Internet',
  ],
};

// Fasilitas standar kamar kost (sesuai website utama kost-tiga-a.web.id)
export const ROOM_FACILITIES = [
  { id: 'ac', name: 'AC', desc: 'Pilihan AC atau non-AC' },
  { id: 'bath', name: 'Kamar mandi dalam', desc: 'Privat, higienis, dan tidak perlu antre' },
  { id: 'bed', name: 'Kasur, bantal & guling', desc: 'Tempat nyaman untuk beristirahat' },
  { id: 'desk', name: 'Meja & Kursi', desc: 'Pas untuk belajar, mengerjakan skripsi, atau bekerja' },
  { id: 'wardrobe', name: 'Lemari pakaian', desc: 'Simpan pakaian dan barang pribadi dengan rapi' },
  { id: 'wifi', name: 'Wifi / Internet', desc: 'Untuk kuliah, kerja, dan hiburan' },
];

export const INITIAL_ROOMS = [
  ...Array.from({ length: 11 }, (_, index) => {
    const number = String(101 + index);
    return { id: number, number, locationId: 'athaya', type: '', price: 0, status: 'available', tenantId: null, facilities: [] };
  }),
  ...Array.from({ length: 12 }, (_, index) => {
    const number = String(201 + index);
    return { id: number, number, locationId: 'alya', type: '', price: 0, status: 'available', tenantId: null, facilities: [] };
  }),
];

export const INITIAL_TENANTS = [];
export const INITIAL_TRANSACTIONS = [];
export const INITIAL_COMPLAINTS = [];
