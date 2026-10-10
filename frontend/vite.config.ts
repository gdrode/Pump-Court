import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The motion tracker and referee are the teammate's code in ../pumpCourt/src,
// imported as "@tracker/…" (e.g. "@tracker/judge"), so there is one copy of it.
const tracker = fileURLToPath(new URL("../pumpCourt/src", import.meta.url));

// Tauri loads the dev server at a fixed port (see backend/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: { "@tracker": tracker },
    // pumpCourt/ has no node_modules of its own here: use frontend's copy.
    dedupe: ["@mediapipe/tasks-vision"],
  },
  server: { port: 5173, strictPort: true, fs: { allow: [".", tracker] } },
  envPrefix: ["VITE_", "TAURI_"],
});
