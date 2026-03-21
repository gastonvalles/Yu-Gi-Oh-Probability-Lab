import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const isMountedWindowsWorkspace = process.cwd().startsWith('/mnt/')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: isMountedWindowsWorkspace
      ? {
          usePolling: true,
          interval: 150,
        }
      : undefined,
  },
})
