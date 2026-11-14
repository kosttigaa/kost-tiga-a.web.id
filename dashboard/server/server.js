import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { COLLECTIONS, HttpError, openDatabase } from './db.js';

const serverDir = import.meta.dirname;
const envFile = path.join(serverDir, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = process.env.DB_PATH || path.join(serverDir, 'data', 'kost.db');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

const ACCOUNTS = {
  admin: { password: process.env.ADMIN_PASSWORD, role: 'admin' },
  penjaga: { password: process.env.PENJAGA_PASSWORD, role: 'penjaga' },
};
for (const [username, account] of Object.entries(ACCOUNTS)) {
  if (!account.password) console.warn(`Akun "${username}" nonaktif: kata sandi belum diatur di .env`);
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET belum diatur: pengguna harus login ulang setiap server restart');
}

const db = openDatabase(DB_PATH);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(String(a)), sha256(String(b)));
const sign = (payload) => crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');

const createToken = (role) => {
  const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

const readToken = (token) => {
  const [payload, signature] = String(token).split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const { role, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return ACCOUNTS[role] && exp > Date.now() ? { role } : null;
  } catch {
    return null;
  }
};

const failedLogins = new Map();
const cleanupFailedLogins = () => {
  const now = Date.now();
  for (const [ip, entry] of failedLogins.entries()) {
    if (entry.resetAt <= now) failedLogins.delete(ip);
  }
};
setInterval(cleanupFailedLogins, LOGIN_WINDOW_MS).unref();
const isLoginBlocked = (ip) => {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    failedLogins.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
};
const recordLoginFailure = (ip) => {
  const entry = failedLogins.get(ip);
  if (entry && entry.resetAt > Date.now()) entry.count += 1;
  else failedLogins.set(ip, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
};

const requireAuth = (req, _res, next) => {
  const header = req.get('authorization') || '';
  const session = header.startsWith('Bearer ') ? readToken(header.slice(7)) : null;
  if (!session) throw new HttpError(401, 'Sesi tidak valid, silakan login ulang');
  req.session = session;
  next();
};

const requireAdmin = (req, _res, next) => {
  if (req.session.role !== 'admin') throw new HttpError(403, 'Hanya admin yang dapat mengakses ini');
  next();
};

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let text = Array.isArray(value) ? value.join(', ') : String(value);
  // Cegah formula injection di Excel/Sheets, tetapi biarkan angka dan nomor telepon apa adanya.
  if (/^[=@\t\r]/.test(text) || (/^[+-]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const LOCATION_NAMES = {
  athaya: 'Kost Putri: Athaya',
  alya: 'Kost Putri: Alya',
  andayani: 'Kost Putri: Andayani',
};
const DATE_FIELDS = new Set(['date', 'entryDate', 'dueDate']);

const formatDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

const toCsv = (name, records, rooms) => {
  const roomByNumber = new Map(rooms.map((room) => [String(room.number), room]));
  const roomLabel = (roomNumber) => {
    const raw = String(roomNumber);
    const room = roomByNumber.get(raw);
    const display = raw.slice(-2).padStart(2, '0');
    return room ? `${LOCATION_NAMES[room.locationId] || 'Kost'} - Kamar ${display}` : `Kamar ${display}`;
  };
  // Catatan lama menyimpan nomor kamar mentah (mis. "kamar 101").
  const formatNote = (record) => {
    if (!record.note || !record.roomNumber || record.roomNumber === '-') return record.note;
    const escaped = String(record.roomNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return record.note.replace(new RegExp(`kamar ${escaped}(?!\\d)`, 'i'), roomLabel(record.roomNumber));
  };
  const formatCell = (key, record) => {
    if (key === 'number' && name === 'rooms') return roomLabel(record.number);
    if (key === 'roomNumber') return record.roomNumber && record.roomNumber !== '-' ? roomLabel(record.roomNumber) : record.roomNumber;
    if (key === 'note') return formatNote(record);
    if (DATE_FIELDS.has(key)) return formatDate(record[key]);
    return record[key];
  };

  const keys = ['id', ...COLLECTIONS[name].fields.map(([key]) => key)];
  const lines = [keys.join(','), ...records.map((record) => keys.map((key) => csvCell(formatCell(key, record))).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
};

const today = () => new Date().toISOString().slice(0, 10);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(['/api', '/dashboard/api'], (_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  next();
});
app.use(express.json({ limit: '2mb' }));

const api = express.Router();

api.post('/login', (req, res) => {
  if (isLoginBlocked(req.ip)) throw new HttpError(429, 'Terlalu banyak percobaan login, coba lagi nanti');
  const { username, password } = req.body ?? {};
  const account = typeof username === 'string' ? ACCOUNTS[username.trim().toLowerCase()] : undefined;
  if (!account?.password || typeof password !== 'string' || !safeEqual(password, account.password)) {
    recordLoginFailure(req.ip);
    throw new HttpError(401, 'Username atau kata sandi tidak valid');
  }
  failedLogins.delete(req.ip);
  res.json({ token: createToken(account.role), role: account.role });
});

api.get('/data', requireAuth, (req, res) => {
  res.json(db.readAll({ includeTransactions: req.session.role === 'admin' }));
});

api.post('/sync', requireAuth, (req, res) => {
  const { init = false, changes } = req.body ?? {};
  const isAdmin = req.session.role === 'admin';
  if (init && !isAdmin) throw new HttpError(403, 'Hanya admin yang dapat menyiapkan data awal');
  // Penjaga hanya boleh mencatat transaksi baru (misalnya pembayaran awal check-in).
  db.applyChanges(changes, { init: Boolean(init), transactionsInsertOnly: !isAdmin });
  res.json({ ok: true });
});

api.get('/export/database', requireAuth, requireAdmin, (_req, res) => {
  res.set({
    'Content-Type': 'application/vnd.sqlite3',
    'Content-Disposition': `attachment; filename="kost-tiga-a-${today()}.db"`,
  });
  res.send(db.serialize());
});

api.get('/export/:name', requireAuth, requireAdmin, (req, res) => {
  const name = req.params.name.replace(/\.csv$/, '');
  if (!COLLECTIONS[name]) throw new HttpError(404, 'Data tidak ditemukan');
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="kost-tiga-a-${name}-${today()}.csv"`,
  });
  const data = db.readAll();
  res.send(toCsv(name, data[name], data.rooms));
});

api.use(() => {
  throw new HttpError(404, 'Endpoint tidak ditemukan');
});

app.use('/api', api);
app.use('/dashboard/api', api);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : (err.status ?? err.statusCode);
  if (status && status < 500) {
    res.status(status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Kost Tiga A API berjalan di http://${HOST}:${PORT} (database: ${DB_PATH})`);
});

const shutdown = () => {
  server.close(() => {
    try {
      db.checkpoint('TRUNCATE');
    } catch (e) {
      console.warn('Gagal checkpoint WAL:', e);
    }
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
