import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works at any URL (e.g. GitHub Pages at /kindle-clone/).
  base: './',
})
