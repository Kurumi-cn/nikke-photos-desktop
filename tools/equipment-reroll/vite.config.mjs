import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  base: './',
  cacheDir: process.env.NIKKE_VITE_CACHE ? `${process.env.NIKKE_VITE_CACHE}/equipment-reroll` : '../../../codex temp/nikke-desktop/vite-equipment-reroll',
  build: {
    target: 'esnext',
    rolldownOptions: { input: { calculator:fileURLToPath(new URL('./index.html',import.meta.url)), simulator:fileURLToPath(new URL('./simulator/index.html',import.meta.url)) } },
    outDir: fileURLToPath(new URL('../../public/tools/equipment-reroll', import.meta.url)),
    emptyOutDir: true,
  },
})
