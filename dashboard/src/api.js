const TOKEN_KEY = 'juragankost_token';

export const COLLECTION_NAMES = ['rooms', 'tenants', 'transactions', 'complaints', 'registrations'];

// Koleksi yang tampil dengan data terbaru di urutan pertama (harus sama dengan server).
const PREPEND_COLLECTIONS = new Set(['transactions', 'complaints', 'registrations']);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const request = async (path, { method = 'GET', body, blob = false } = {}) => {
  const token = getToken();
  let response;
  try {
    response = await fetch(`/dashboard/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload.error || `Permintaan gagal (${response.status})`);
  }
  return blob ? response.blob() : response.json();
};

export const login = (username, password) => request('/login', { method: 'POST', body: { username, password } });
export const fetchData = () => request('/data');
export const pushChanges = (changes, { init = false } = {}) => request('/sync', { method: 'POST', body: { init, changes } });

export const downloadExport = async (name, filename) => {
  const blob = await request(`/export/${name}`, { blob: true });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// Snapshot = peta id -> JSON tiap data, dipakai untuk menghitung perubahan sejak sinkronisasi terakhir.
export const buildSnapshot = (data) => Object.fromEntries(COLLECTION_NAMES.map((name) => [
  name,
  new Map((data[name] ?? []).map((record) => [record.id, JSON.stringify(record)])),
]));

export const emptySnapshot = () => buildSnapshot({});

export const diffData = (snapshot, data) => {
  const changes = {};
  let hasChanges = false;

  for (const name of COLLECTION_NAMES) {
    const previous = snapshot[name];
    const upsert = [];
    const seen = new Set();
    for (const record of data[name]) {
      seen.add(record.id);
      if (previous.get(record.id) !== JSON.stringify(record)) upsert.push(record);
    }
    const remove = [...previous.keys()].filter((id) => !seen.has(id));
    if (upsert.length === 0 && remove.length === 0) continue;

    hasChanges = true;
    // Server mengurutkan menurut urutan masuk, jadi data terbaru harus dikirim paling akhir.
    changes[name] = { upsert: PREPEND_COLLECTIONS.has(name) ? upsert.reverse() : upsert, remove };
  }

  return { changes, hasChanges, nextSnapshot: buildSnapshot(data) };
};
