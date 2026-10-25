import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const file = path.join(dataDir, "rooms.json");
const targets = ["athaya", "alya"];

let rooms = {};
try {
  rooms = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
    throw error;
  }
}

const [target, value] = process.argv.slice(2);

if (target === undefined) {
  for (const name of targets) {
    const available = rooms[name]?.available;
    console.log(`${name}: ${available === undefined ? "belum diatur" : `${available} kamar kosong`}`);
  }
  if (rooms.updatedAt) {
    console.log(`Diperbarui: ${rooms.updatedAt}`);
  }
  process.exit(0);
}

const available = Number(value);
if (!targets.includes(target) || value === undefined || !Number.isInteger(available) || available < 0 || available > 99) {
  console.error("Pemakaian: node scripts/rooms.js <athaya|alya> <jumlah kamar kosong 0-99>");
  console.error("Tanpa argumen: tampilkan status saat ini.");
  process.exit(1);
}

rooms[target] = { available };
rooms.updatedAt = new Date().toISOString();

await mkdir(dataDir, { recursive: true });
const temp = `${file}.tmp`;
await writeFile(temp, `${JSON.stringify(rooms, null, 2)}\n`);
await rename(temp, file);
console.log(`${target}: ${available} kamar kosong (disimpan di ${file})`);
