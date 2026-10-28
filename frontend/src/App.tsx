import { useState, type ReactNode } from 'react'
import FilamentsPage from './pages/filaments/FilamentsPage'
import ExpensesPage from './pages/expenses/ExpensesPage'
import PartsPage from './pages/parts/PartsPage'
import SettingsPage from './pages/settings/SettingsPage'
import ProductsPage from './pages/products/ProductsPage'
import { applyTheme, loadTheme, saveTheme, THEMES, type ThemePref } from './theme'

type Page = 'products' | 'filaments' | 'parts' | 'expenses' | 'settings'

const NAV: { page: Page; label: string; icon: ReactNode }[] = [
  {
    page: 'products',
    label: '제품 원가',
    icon: (
      <>
        <path d="M4 7h16v12H4z" />
        <path d="M8 7V5h8v2" />
        <path d="M12 11v4M10 13h4" />
      </>
    ),
  },
  {
    page: 'filaments',
    label: '필라멘트',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 4v5.5M12 14.5V20" />
      </>
    ),
  },
  {
    page: 'parts',
    label: '부자재',
    icon: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z" />,
  },
  {
    page: 'expenses',
    label: '지출',
    icon: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
  },
  {
    page: 'settings',
    label: '제품 원가 설정',
    icon: (
      <>
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
  },
]

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const THEME_ICON: Record<ThemePref, ReactNode> = {
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
}

// 사이드바 접힘 상태는 브라우저에 기억 (저장할 수 없는 환경이면 기억만 안 함)
const SIDE_KEY = 'pff-side-collapsed'

function loadCollapsed() {
  try {
    return localStorage.getItem(SIDE_KEY) === '1'
  } catch {
    return false
  }
}

export default function App() {
  const [page, setPage] = useState<Page>('filaments')
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [theme, setTheme] = useState(loadTheme)
  const current = NAV.find((n) => n.page === page)!
  const currentTheme = THEMES.find((t) => t.pref === theme)!

  const chooseTheme = (pref: ThemePref) => {
    setTheme(pref)
    saveTheme(pref)
    applyTheme(pref)
  }
  // 접힌 사이드바에서는 아이콘 하나: 누를 때마다 다음 테마
  const nextTheme = () => chooseTheme(THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length].pref)

  const toggleSide = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(SIDE_KEY, next ? '1' : '0')
    } catch {
      /* 저장 불가 */
    }
  }

  return (
    <div className={collapsed ? 'layout collapsed' : 'layout'}>
      <aside className="sidebar">
        <div className="side-brand">
          <span className="mark">3D</span>
          <span className="label">3D Farm Farm</span>
        </div>
        {NAV.map((n) => (
          <button
            key={n.page}
            className={n.page === page ? 'nav-item active' : 'nav-item'}
            title={n.label}
            onClick={() => setPage(n.page)}
          >
            <Icon>{n.icon}</Icon>
            <span className="label">{n.label}</span>
          </button>
        ))}
        <div className="side-bottom">
          <div className="theme-seg" role="radiogroup" aria-label="테마">
            {THEMES.map((t) => (
              <button
                key={t.pref}
                type="button"
                role="radio"
                aria-checked={t.pref === theme}
                className={t.pref === theme ? 'on' : ''}
                title={`테마: ${t.label}`}
                onClick={() => chooseTheme(t.pref)}
              >
                <Icon>{THEME_ICON[t.pref]}</Icon>
                {t.label}
              </button>
            ))}
          </div>
          <button
            className="nav-item theme-one"
            title={`테마: ${currentTheme.label} (누르면 다음)`}
            onClick={nextTheme}
          >
            <Icon>{THEME_ICON[theme]}</Icon>
            <span className="label">{currentTheme.label}</span>
          </button>
          <button className="nav-item" data-act="toggle-side" title="사이드바 접기/펼치기" onClick={toggleSide}>
            <Icon>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </Icon>
            <span className="label">{collapsed ? '펼치기' : '접기'}</span>
          </button>
        </div>
      </aside>
      <main>
        <h1 className="page-title">{current.label}</h1>
        {page === 'filaments' ? (
          <FilamentsPage />
        ) : page === 'products' ? (
          <ProductsPage />
        ) : page === 'parts' ? (
          <PartsPage />
        ) : page === 'expenses' ? (
          <ExpensesPage />
        ) : (
          <SettingsPage />
        )}
      </main>
    </div>
  )
}
