import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Waktu build ditetapkan ke WIB agar sama di komputer lokal maupun VPS.
const formatBuildTime = (date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export default defineConfig({
  base: '/dashboard/',
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(formatBuildTime(new Date())),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/dashboard/api': {
        target: 'http://127.0.0.1:5000',
        rewrite: (path) => path.replace(/^\/dashboard/, ''),
      },
      '/api': 'http://127.0.0.1:5000',
    },
  },
})
