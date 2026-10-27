import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 중에는 Django(127.0.0.1:8000)를 같은 주소처럼 쓰도록 프록시한다.
// /api: DRF JSON API, /admin·/static: Django 관리자 화면, /media: 업로드 이미지
// changeOrigin: 폰(내부 IP)으로 들어와도 Django 에는 127.0.0.1 로 보내서 ALLOWED_HOSTS 에 걸리지 않게
const DJANGO = { target: 'http://127.0.0.1:8000', changeOrigin: true }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 같은 와이파이(공유기 안)의 폰에서도 http://PC내부IP:5173 으로 접속 (SYS-02). 공인 IP 를 직접 받는 PC 에서는 끌 것
    host: true,
    // PC 이름으로도 접속 (예: http://hancheung.local:5173). Vite 는 IP · localhost 가 아닌 이름을 기본으로 막는다
    allowedHosts: ['.local'],
    proxy: {
      '/api': DJANGO,
      '/admin': DJANGO,
      '/static': DJANGO,
      '/media': DJANGO,
    },
  },
})
