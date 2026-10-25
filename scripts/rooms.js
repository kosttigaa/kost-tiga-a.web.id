import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const file = path.join(dataDir, "rooms.json");
const targets = ["athaya", "alya"];
const types = { ac: "AC", nonac: "Non-AC" };

let rooms = {};
try {
  rooms = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
    throw error;
  }
}

const [target, type, value] = process.argv.slice(2);

if (target === undefined) {
  for (const name of targets) {
    const parts = Object.entries(types).map(([key, label]) => {
      const count = rooms[name]?.[key];
      return `${label}: ${Number.isInteger(count) ? count : "belum diatur"}`;
    });
    console.log(`${name} -> ${parts.join(" | ")}`);
  }
  if (rooms.updatedAt) {
    console.log(`Diperbarui: ${rooms.updatedAt}`);
  }
  process.exit(0);
}

const count = Number(value);
if (
  !targets.includes(target) ||
  !(type in types) ||
  value === undefined ||
  !Number.isInteger(count) ||
  count < 0 ||
  count > 99
) {
  console.error("Pemakaian: node scripts/rooms.js <athaya|alya> <ac|nonac> <jumlah kamar kosong 0-99>");
  console.error("Tanpa argumen: tampilkan status saat ini.");
  process.exit(1);
}

rooms[target] = { ...rooms[target], [type]: count };
rooms.updatedAt = new Date().toISOString();

await mkdir(dataDir, { recursive: true });
const temp = `${file}.tmp`;
await writeFile(temp, `${JSON.stringify(rooms, null, 2)}\n`);
await rename(temp, file);
console.log(`${target} ${types[type]}: ${count} kamar kosong (disimpan di ${file})`);
