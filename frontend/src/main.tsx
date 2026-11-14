import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/app.css'
import './styles/products.css'
import './styles/stock.css'
import './styles/settings.css'
import './styles/expenses.css'
import './styles/sales.css'
import './styles/qr.css'
import App from './App.tsx'
import ScanPage from './pages/scan/ScanPage.tsx'
import ToastProvider from './components/Toast.tsx'
import ConfirmProvider from './components/Confirm.tsx'
import { applyTheme, loadTheme } from './theme.ts'

// 테마: 고른 값(기본 시스템)을 첫 화면 전에 적용. 바꾸기는 사이드바 (App.tsx)
applyTheme(loadTheme())

// 폰으로 QR 라벨을 찍으면 열리는 주소 /s/S00012 → 폰 스풀 화면 (TBD-18). 나머지 주소는 모두 앱
// (개발 서버가 모르는 주소에도 index.html 을 주므로 주소 이동 라이브러리 없이 여기서 나눈다)
const scan = window.location.pathname.match(/^\/s\/([^/]+)\/?$/)

// 같은 PC 의 서버라 실패하면 한 번만 다시 시도
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>{scan ? <ScanPage code={decodeURIComponent(scan[1])} /> : <App />}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
