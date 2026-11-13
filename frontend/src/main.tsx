import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/app.css'
import './styles/products.css'
import './styles/stock.css'
import './styles/settings.css'
import './styles/expenses.css'
import './styles/sales.css'
import App from './App.tsx'
import ToastProvider from './components/Toast.tsx'
import ConfirmProvider from './components/Confirm.tsx'
import { applyTheme, loadTheme } from './theme.ts'

// 테마: 고른 값(기본 시스템)을 첫 화면 전에 적용. 바꾸기는 사이드바 (App.tsx)
applyTheme(loadTheme())

// 같은 PC 의 서버라 실패하면 한 번만 다시 시도
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
