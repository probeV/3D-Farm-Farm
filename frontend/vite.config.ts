import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 중에는 Django(127.0.0.1:8000)를 같은 주소처럼 쓰도록 프록시한다.
// /api: DRF JSON API, /admin·/static: Django 관리자 화면
const DJANGO = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': DJANGO,
      '/admin': DJANGO,
      '/static': DJANGO,
    },
  },
})
