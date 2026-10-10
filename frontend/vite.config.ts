import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri loads the dev server at a fixed port (see backend/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
});
