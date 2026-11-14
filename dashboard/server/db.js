import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const TEXT = 'text';
const INT = 'int';
const JSON_FIELD = 'json';

// Kolom terstruktur per koleksi. Field lain dari aplikasi disimpan di kolom `extra`.
// `prepend`: aplikasi menampilkan data terbaru di urutan pertama.
export const COLLECTIONS = {
  rooms: {
    prepend: false,
    fields: [
      ['number', TEXT], ['locationId', TEXT], ['type', TEXT], ['price', INT],
      ['status', TEXT], ['tenantId', TEXT], ['facilities', JSON_FIELD],
    ],
  },
  tenants: {
    prepend: false,
    fields: [
      ['name', TEXT], ['phone', TEXT], ['ktp', TEXT], ['roomNumber', TEXT],
      ['entryDate', TEXT], ['dueDate', TEXT], ['paymentStatus', TEXT],
      ['deposit', INT], ['emergencyContact', TEXT],
    ],
  },
  transactions: {
    prepend: true,
    fields: [
      ['date', TEXT], ['type', TEXT], ['category', TEXT], ['amount', INT],
      ['roomNumber', TEXT], ['tenantName', TEXT], ['note', TEXT],
    ],
  },
  complaints: {
    prepend: true,
    fields: [
      ['roomNumber', TEXT], ['tenantName', TEXT], ['issue', TEXT], ['date', TEXT],
      ['status', TEXT], ['priority', TEXT], ['costEst', INT],
    ],
  },
  registrations: {
    prepend: true,
    fields: [
      ['kost', TEXT], ['fullName', TEXT], ['nik', TEXT], ['phone', TEXT],
      ['address', TEXT], ['guardianName', TEXT], ['guardianPhone', TEXT],
      ['vehicle', TEXT], ['ktpImage', TEXT], ['pdfFile', TEXT],
      ['status', TEXT], ['date', TEXT], ['note', TEXT],
    ],
  },
};

const MAX_RECORDS_PER_REQUEST = 5000;
const MAX_ID_LENGTH = 100;

const snakeCase = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const toColumnValue = (value, type) => {
  if (value === undefined || value === null) return null;
  if (type === INT) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : 0;
  }
  if (type === JSON_FIELD) return JSON.stringify(value);
  return String(value);
};

const fromColumnValue = (value, type) => {
  if (value === null || type !== JSON_FIELD) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const buildTable = (db, name, spec) => {
  const columns = spec.fields.map(([key, type]) => ({
    key,
    type,
    column: snakeCase(key),
    sqlType: type === INT ? 'INTEGER' : 'TEXT',
  }));

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${name} (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      ${columns.map((c) => `${c.column} ${c.sqlType}`).join(',\n      ')},
      extra TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_${name}_seq ON ${name}(seq);
  `);

  if (name === 'rooms') {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rooms_number ON rooms(number);
      CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
    `);
  } else if (name === 'tenants') {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tenants_room_number ON tenants(room_number);
    `);
  } else if (name === 'transactions') {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_room ON transactions(room_number);
    `);
  } else if (name === 'complaints') {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    `);
  }

  const names = ['id', 'seq', ...columns.map((c) => c.column), 'extra', 'updated_at'];
  const values = ['@id', `(SELECT COALESCE(MAX(seq), 0) + 1 FROM ${name})`, ...columns.map((c) => `@${c.column}`), '@extra', '@updatedAt'];
  const insertSql = `INSERT INTO ${name} (${names.join(', ')}) VALUES (${values.join(', ')})`;
  const updates = [...columns.map((c) => c.column), 'extra', 'updated_at'].map((c) => `${c} = excluded.${c}`);

  return {
    columns,
    upsert: db.prepare(`${insertSql} ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`),
    insertOnly: db.prepare(`${insertSql} ON CONFLICT(id) DO NOTHING`),
    remove: db.prepare(`DELETE FROM ${name} WHERE id = ?`),
    list: db.prepare(`SELECT * FROM ${name} ORDER BY seq ${spec.prepend ? 'DESC' : 'ASC'}`),
  };
};

export function openDatabase(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  const tables = Object.fromEntries(
    Object.entries(COLLECTIONS).map(([name, spec]) => [name, buildTable(db, name, spec)]),
  );
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
  const setMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

  const toRow = (table, record) => {
    const known = new Set(['id', ...table.columns.map((c) => c.key)]);
    const extra = {};
    for (const [key, value] of Object.entries(record)) {
      if (!known.has(key)) extra[key] = value;
    }
    const row = { id: record.id, extra: JSON.stringify(extra), updatedAt: new Date().toISOString() };
    for (const column of table.columns) {
      row[column.column] = toColumnValue(record[column.key], column.type);
    }
    return row;
  };

  const toRecord = (table, row) => {
    const record = { id: row.id };
    for (const column of table.columns) {
      record[column.key] = fromColumnValue(row[column.column], column.type);
    }
    try {
      Object.assign(record, JSON.parse(row.extra));
    } catch {
      // extra rusak diabaikan; kolom terstruktur tetap dikembalikan
    }
    return record;
  };

  const validateRecords = (records, label) => {
    if (!Array.isArray(records)) throw new HttpError(400, `${label} harus berupa array`);
    for (const record of records) {
      const valid = record && typeof record === 'object' && !Array.isArray(record)
        && typeof record.id === 'string' && record.id.length > 0 && record.id.length <= MAX_ID_LENGTH;
      if (!valid) throw new HttpError(400, `${label}: setiap data wajib punya id teks`);
    }
  };

  const isInitialized = () => getMeta.get('initialized')?.value === '1';

  const readAll = ({ includeTransactions = true } = {}) => ({
    initialized: isInitialized(),
    ...Object.fromEntries(Object.keys(COLLECTIONS).map((name) => [
      name,
      name === 'transactions' && !includeTransactions
        ? []
        : tables[name].list.all().map((row) => toRecord(tables[name], row)),
    ])),
  });

  // Satu transaksi untuk seluruh perubahan agar data tidak setengah tersimpan.
  const applyChanges = db.transaction((changes, { init, transactionsInsertOnly }) => {
    if (init && isInitialized()) throw new HttpError(409, 'already_initialized');
    if (!init && !isInitialized()) throw new HttpError(409, 'not_initialized');
    if (!changes || typeof changes !== 'object') throw new HttpError(400, 'changes tidak valid');

    let total = 0;
    for (const [name, change] of Object.entries(changes)) {
      const table = tables[name];
      if (!table) throw new HttpError(400, `Koleksi tidak dikenal: ${name}`);
      const upsert = change?.upsert ?? [];
      const remove = change?.remove ?? [];
      validateRecords(upsert, `${name}.upsert`);
      if (!Array.isArray(remove) || remove.some((id) => typeof id !== 'string')) {
        throw new HttpError(400, `${name}.remove harus berupa array id`);
      }
      total += upsert.length + remove.length;
      if (total > MAX_RECORDS_PER_REQUEST) throw new HttpError(413, 'Terlalu banyak data dalam satu permintaan');

      if (name === 'transactions' && transactionsInsertOnly && remove.length > 0) {
        throw new HttpError(403, 'Tidak diizinkan menghapus transaksi');
      }
      const write = name === 'transactions' && transactionsInsertOnly ? table.insertOnly : table.upsert;
      for (const record of upsert) write.run(toRow(table, record));
      for (const id of remove) table.remove.run(id);
    }
    if (init) setMeta.run('initialized', '1');
  });

  // Migrasi data pendaftar dari registrations.jsonl jika tabel registrations masih kosong
  try {
    const regTable = tables.registrations;
    if (regTable && regTable.list.all().length === 0) {
      const candidates = [
        path.resolve(path.dirname(file), '..', '..', 'data', 'registrations.jsonl'),
        path.resolve(path.dirname(file), '..', '..', '..', 'data', 'registrations.jsonl'),
      ];
      const jsonlPath = candidates.find((p) => existsSync(p));
      if (jsonlPath) {
        const content = readFileSync(jsonlPath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry && entry.id) {
              const record = {
                id: entry.id,
                kost: entry.kost || '',
                fullName: entry.fullName || '',
                nik: entry.nik || '',
                phone: entry.phone || '',
                address: entry.address || '',
                guardianName: entry.guardianName || '',
                guardianPhone: entry.guardianPhone || '',
                vehicle: entry.vehicle || '',
                ktpImage: entry.ktpImage || '',
                pdfFile: entry.pdfFile || '',
                status: entry.status || 'pending',
                date: entry.timestamp ? entry.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10),
                note: entry.note || '',
                agreement: entry.agreement || '',
              };
              regTable.upsert.run(toRow(regTable, record));
            }
          } catch {
            // Abaikan baris rusak
          }
        }
      }
    }
  } catch (err) {
    console.warn('Migrasi registrations.jsonl dilewati:', err?.message || err);
  }

  return {
    readAll,
    applyChanges,
    isInitialized,
    checkpoint: (mode = 'PASSIVE') => db.pragma(`wal_checkpoint(${mode})`),
    serialize: () => db.serialize(),
    close: () => db.close(),
  };
}
