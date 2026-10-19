import { useState, type ReactNode } from 'react'

type Page = 'products' | 'filaments' | 'supplies' | 'settings'

const NAV: { page: Page; label: string; icon: ReactNode }[] = [
  {
    page: 'products',
    label: '제품 원가',
    icon: <><path d="M4 7h16v12H4z" /><path d="M8 7V5h8v2" /><path d="M12 11v4M10 13h4" /></>,
  },
  {
    page: 'filaments',
    label: '필라멘트',
    icon: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 4v5.5M12 14.5V20" /></>,
  },
  {
    page: 'supplies',
    label: '부자재',
    icon: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z" />,
  },
  {
    page: 'settings',
    label: '설정',
    icon: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  },
]

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('filaments')
  const [collapsed, setCollapsed] = useState(false)
  const current = NAV.find((n) => n.page === page)!

  return (
    <div className={collapsed ? 'layout collapsed' : 'layout'}>
      <aside className="sidebar">
        <div className="side-brand"><span className="mark">3D</span><span className="label">3D Farm Farm</span></div>
        {NAV.map((n) => (
          <button
            key={n.page}
            className={n.page === page ? 'nav-item active' : 'nav-item'}
            title={n.label}
            onClick={() => setPage(n.page)}
          >
            <Icon>{n.icon}</Icon><span className="label">{n.label}</span>
          </button>
        ))}
        <div className="side-bottom">
          <button className="nav-item" title="사이드바 접기/펼치기" onClick={() => setCollapsed((c) => !c)}>
            <Icon><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Icon>
            <span className="label">{collapsed ? '펼치기' : '접기'}</span>
          </button>
        </div>
      </aside>
      <main>
        <h1 className="page-title">{current.label}</h1>
        <div className="empty">준비 중인 화면이에요.</div>
      </main>
    </div>
  )
}
