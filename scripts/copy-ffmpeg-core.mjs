// Copia o core ESM do FFmpeg de node_modules para public/ffmpeg.
// Rodado automaticamente antes do dev e do build (predev/prebuild).
// Assim o core (~32MB) fica servido same-origin sem precisar entrar no git.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/@ffmpeg/core/dist/esm");
const dest = resolve(root, "public/ffmpeg");

const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

mkdirSync(dest, { recursive: true });
for (const file of files) {
  const from = resolve(src, file);
  if (!existsSync(from)) {
    console.error(`[copy-ffmpeg-core] Não encontrei ${from}. Rode "npm install".`);
    process.exit(1);
  }
  copyFileSync(from, resolve(dest, file));
}
console.log("[copy-ffmpeg-core] core ESM copiado para public/ffmpeg");
