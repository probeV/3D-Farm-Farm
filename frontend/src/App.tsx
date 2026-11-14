import { useState, type ReactNode } from 'react'
import { NavContext, type LabelPick, type Nav } from './nav'
import ExpensesPage from './pages/expenses/ExpensesPage'
import SalesPage from './pages/sales/SalesPage'
import StockPage from './pages/stock/StockPage'
import SettingsPage from './pages/settings/SettingsPage'
import type { CategoryKey } from './pages/settings/schemas'
import ProductsPage from './pages/products/ProductsPage'
import { applyTheme, loadTheme, saveTheme, THEMES, type ThemePref } from './theme'

type Page = 'products' | 'stock' | 'sales' | 'expenses' | 'settings'

type NavItem = { page: Page; label: string; icon: ReactNode }

const NAV: NavItem[] = [
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
  // v2 STOCK: 필라멘트 · 부자재 대신 하나 (화면 위 탭: 필라멘트 | 부속품 | 포장 | 소모품)
  {
    page: 'stock',
    label: '재고 관리',
    icon: (
      <>
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
        <path d="M12 13v8" />
      </>
    ),
  },
  {
    page: 'sales',
    label: '판매',
    icon: (
      <>
        <path d="M3 7h18l-2 12H5z" />
        <path d="M8 7a4 4 0 0 1 8 0" />
        <path d="M12 11v5M9.5 13.5h5" />
      </>
    ),
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
]

// 사이드바 맨 아래 (접기 위). 분류는 설정 화면 안에서 (TBD-16)
const SETTINGS: NavItem = {
  page: 'settings',
  label: '설정',
  icon: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
}

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
  // 처음 여는 화면은 제품 원가 (v1.2.0)
  const [page, setPage] = useState<Page>('products')
  const [settingsTab, setSettingsTab] = useState<CategoryKey>('cost')
  // QR 라벨 인쇄 화면 (재고 관리 › 필라멘트 › QR, TBD-18). null 이면 재고 관리 탭 화면. key 는 열 때마다 새로 (고른 스풀 다시)
  const [labels, setLabels] = useState<{ pick: LabelPick | null; key: number } | null>(null)
  const nav: Nav = {
    openLabels: (pick) => {
      setLabels({ pick: pick ?? null, key: Date.now() })
      setPage('stock')
    },
  }
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [theme, setTheme] = useState(loadTheme)
  const current = [...NAV, SETTINGS].find((n) => n.page === page)!
  // 각 화면의 ⚙ 버튼: 설정의 자기 분류로 바로
  const openSettings = (tab: CategoryKey) => {
    setSettingsTab(tab)
    setPage('settings')
  }
  const navButton = (n: NavItem) => (
    <button
      key={n.page}
      className={n.page === page ? 'nav-item active' : 'nav-item'}
      title={n.label}
      onClick={() => {
        setLabels(null)
        setPage(n.page)
      }}
    >
      <Icon>{n.icon}</Icon>
      <span className="label">{n.label}</span>
    </button>
  )
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
    <NavContext.Provider value={nav}>
      <div className={collapsed ? 'layout collapsed' : 'layout'}>
        <aside className="sidebar">
          <div className="side-brand">
            <span className="mark">3D</span>
            <span className="label">3D Farm Farm</span>
          </div>
          {NAV.map(navButton)}
          <div className="side-bottom">
            {navButton(SETTINGS)}
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
          {page === 'stock' ? (
            <StockPage labels={labels} onCloseLabels={() => setLabels(null)} />
          ) : page === 'products' ? (
            <ProductsPage onSettings={() => openSettings('cost')} />
          ) : page === 'sales' ? (
            <SalesPage onSettings={() => openSettings('store')} />
          ) : page === 'expenses' ? (
            <ExpensesPage />
          ) : (
            <SettingsPage tab={settingsTab} onTab={setSettingsTab} />
          )}
        </main>
      </div>
    </NavContext.Provider>
  )
}
