import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/app.css'
import App from './App.tsx'
import ToastProvider from './components/Toast.tsx'

// 테마: 시스템 설정을 따르고, 바뀌면 바로 반영 (색상 토큰은 styles/app.css)
const dark = matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => (document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light')
applyTheme()
dark.addEventListener('change', applyTheme)

// 같은 PC 의 서버라 실패하면 한 번만 다시 시도
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
