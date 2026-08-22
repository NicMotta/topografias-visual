import { readFile, writeFile, readdir } from "node:fs/promises";

const LATENTS = "public/latents.json";
const IMAGES_DIR = "public/imagenes_generadas";

const files = new Set(await readdir(IMAGES_DIR));
const data = JSON.parse(await readFile(LATENTS, "utf8"));

const before = data.items.length;
data.items = data.items.filter((it) => files.has(it.file));
const after = data.items.length;

if (typeof data.num_images === "number") {
  data.num_images = after;
}

await writeFile(LATENTS, JSON.stringify(data));

const missing = [];
for (const file of files) {
  if (!data.items.some((it) => it.file === file)) missing.push(file);
}

console.log(`items: ${before} -> ${after} (${before - after} eliminados)`);
console.log(`imagenes sin referencia en latents.json: ${missing.length}`);
if (missing.length) console.log(missing.join("\n"));
