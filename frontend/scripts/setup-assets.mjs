// Puts the pose tracker's files in public/, so tracking works with Wi-Fi off:
//   public/wasm/   <- node_modules/@mediapipe/tasks-vision/wasm
//   public/models/ <- ../pumpCourt/public/models (downloaded if missing)
// Runs after `npm install` and before `npm run dev` / `npm run build`.
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/wasm");
const modelsDir = join(root, "public/models");
const teamModels = join(root, "../pumpCourt/public/models");
const MODEL = "pose_landmarker_full.task";

cpSync(wasmSrc, wasmDst, { recursive: true });
console.log("[setup-assets] copied wasm -> public/wasm");

mkdirSync(modelsDir, { recursive: true });
const file = join(modelsDir, MODEL);
if (!existsSync(file)) {
  if (existsSync(join(teamModels, MODEL))) {
    copyFileSync(join(teamModels, MODEL), file);
    console.log("[setup-assets] copied the pose model from pumpCourt/public/models");
  } else {
    const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/${MODEL}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      console.log("[setup-assets] downloaded the pose model");
    } catch (err) {
      console.warn(`[setup-assets] could not download the pose model (${err.message}). Download ${url} into frontend/public/models/.`);
    }
  }
}
