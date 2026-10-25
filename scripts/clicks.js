import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const file = path.join(dataDir, "clicks.jsonl");

let text;
try {
  text = await readFile(file, "utf8");
} catch (error) {
  if (error.code === "ENOENT") {
    console.log(`Belum ada data klik di ${file}`);
    process.exit(0);
  }
  throw error;
}

const counts = { total: 0, target: {}, page: {}, slot: {}, day: {} };
const add = (group, key) => {
  group[key] = (group[key] ?? 0) + 1;
};

for (const line of text.split("\n")) {
  if (!line.trim()) continue;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  counts.total += 1;
  add(counts.target, entry.target);
  add(counts.page, entry.page);
  add(counts.slot, `${entry.target} / ${entry.slot}`);
  add(counts.day, new Date(entry.ts).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }));
}

const show = (title, group) => {
  console.log(`\n${title}`);
  const rows = Object.entries(group).sort((a, b) => b[1] - a[1]);
  for (const [key, value] of rows) console.log(`  ${String(value).padStart(5)}  ${key}`);
};

console.log(`Total klik WhatsApp: ${counts.total}`);
show("Per kost", counts.target);
show("Per varian halaman", counts.page);
show("Per posisi tombol", counts.slot);
show("Per hari (WIB)", Object.fromEntries(Object.entries(counts.day).sort()));
