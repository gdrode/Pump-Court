// Copies the MediaPipe wasm files into public/wasm and downloads the pose
// models into public/models if they are missing. Runs after `npm install`,
// so the browser can load everything from the laptop with Wi-Fi off.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDst = join(root, 'public/wasm')
const modelsDir = join(root, 'public/models')
const MODELS = ['full']

cpSync(wasmSrc, wasmDst, { recursive: true })
console.log('[setup-assets] copied wasm -> public/wasm')

mkdirSync(modelsDir, { recursive: true })
for (const variant of MODELS) {
  const file = join(modelsDir, `pose_landmarker_${variant}.task`)
  if (existsSync(file)) continue
  const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/latest/pose_landmarker_${variant}.task`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    console.log(`[setup-assets] downloaded ${variant} model`)
  } catch (err) {
    console.warn(`[setup-assets] could not download ${variant} model (${err.message}). Download it from ${url} into public/models/.`)
  }
}
