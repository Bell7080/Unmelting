import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src',
  base: '/Unmelting/',
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
