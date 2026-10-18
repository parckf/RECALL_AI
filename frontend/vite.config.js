import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this repository beneath /RECALL_AI/.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/RECALL_AI/' : '/',
  plugins: [react()],
})
