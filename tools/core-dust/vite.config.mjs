import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [vue()],
  cacheDir: process.env.NIKKE_VITE_CACHE
    ? `${process.env.NIKKE_VITE_CACHE}/core-dust`
    : '../../../codex temp/nikke-desktop/vite-core-dust',
  build: {
    outDir: fileURLToPath(new URL('../../public/tools/core-dust', import.meta.url)),
    emptyOutDir: true,
  },
})
