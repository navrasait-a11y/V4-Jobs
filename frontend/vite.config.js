import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (mode === 'production' && /localhost|127\.0\.0\.1/.test(env.VITE_API_URL || 'localhost')) {
    console.warn('\n[freejobwala] WARNING: VITE_API_URL points to localhost. Set the live API URL before deploying.\n')
  }
  return {
  plugins: [react(), tailwindcss()],
  // Backend WEB_URL / CORS_ORIGINS use port 3000 in development.
  server: { port: 3000 },
  preview: { port: 3000 },
  build: { chunkSizeWarningLimit: 800 },
  }
})
