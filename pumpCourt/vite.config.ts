import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { phoneSignal } from './server/phoneSignal.ts'

// https://vite.dev/config/
export default defineConfig({
  // HTTPS is required for a phone browser to open its camera. The certificate
  // is self-signed, so each device shows a warning once.
  plugins: [react(), basicSsl(), phoneSignal()],
  server: {
    // Listen on the local network so phones can reach the laptop.
    host: true,
    port: 5173,
    // Allow this Mac's Bonjour name (e.g. "Alexs-MacBook.local") as well as IP addresses.
    allowedHosts: ['.local'],
  },
  preview: { host: true, port: 5173, allowedHosts: ['.local'] },
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        phone: resolve(import.meta.dirname, 'phone.html'),
      },
    },
  },
})
