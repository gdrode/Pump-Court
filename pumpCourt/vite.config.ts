import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { phoneSignal } from './server/phoneSignal.ts'
import { tunnel } from './server/tunnel.ts'

// https://vite.dev/config/
export default defineConfig({
  // HTTPS is required for a phone browser to open its camera. The certificate
  // is self-signed, so each device shows a warning once.
  // `npm run dev:local` sets NO_HTTPS=1: plain http on this laptop only (no phone pairing),
  // for browsers or embedded previews that refuse the self-signed certificate.
  // tunnel() first: its guard must run before anything else serves a request.
  plugins: [tunnel(), react(), ...(process.env.NO_HTTPS ? [] : [basicSsl()]), phoneSignal()],
  server: {
    // Listen on the local network so phones can reach the laptop.
    host: true,
    port: 5173,
    // Allow this Mac's Bonjour name (e.g. "Alexs-MacBook.local") and the internet link's address, as well as IPs.
    allowedHosts: ['.local', '.trycloudflare.com'],
  },
  preview: { host: true, port: 5173, allowedHosts: ['.local', '.trycloudflare.com'] },
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        phone: resolve(import.meta.dirname, 'phone.html'),
      },
    },
  },
})
