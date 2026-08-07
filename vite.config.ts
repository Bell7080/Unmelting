import { defineConfig } from 'vite'
import { resolve } from 'path'

/**
 * 에셋 기준 경로는 **어디에 올리느냐로 갈린다**.
 *
 * GitHub Pages는 저장소 하위 경로(`/Unmelting/`)로 서빙하지만 Vercel은 루트로 서빙한다.
 * 한쪽 값을 하드코딩하면 다른 쪽에서 에셋이 전부 404가 되고, 화면은 하얗게만 뜬다.
 * Vercel이 빌드 환경에 세워 주는 `VERCEL`을 보고 고르며, 필요하면 `VITE_BASE_PATH`로 덮는다.
 */
const basePath = process.env.VITE_BASE_PATH ?? (process.env.VERCEL ? '/' : '/Unmelting/')

export default defineConfig({
  root: 'src',
  base: basePath,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // JS + CSS both go through esbuild — fastest path Vite supports.
    minify: 'esbuild',
    cssMinify: 'esbuild',
    target: 'es2020',
    sourcemap: false,
    // gzip size scan is the slow tail of `vite build`; skip it for faster CI.
    reportCompressedSize: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@systems': resolve(__dirname, './src/systems'),
      '@entities': resolve(__dirname, './src/entities'),
      '@ui': resolve(__dirname, './src/ui'),
      '@data': resolve(__dirname, './src/data'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
