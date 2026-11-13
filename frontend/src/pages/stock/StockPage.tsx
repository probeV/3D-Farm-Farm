import { useState } from 'react'
import FilamentsPage from '../filaments/FilamentsPage'
import ItemsTab from './ItemsTab'
import { TABS, type StockTab } from './kinds'

// 재고 관리 (STOCK-01, docs/screens.md 3장): 사이드바 `재고 관리` 하나, 화면 위 탭 `필라멘트 | 부속품 | 포장 | 소모품`.
// 필라멘트 탭은 기존 필라멘트 화면 그대로 (QR 도 그 안). 나머지는 같은 화면을 탭(kind)으로 나눠 쓴다
export default function StockPage() {
  const [tab, setTab] = useState<StockTab>('filament')
  return (
    <>
      <nav className="stock-tabs">
        {TABS.map((t) => (
          <button key={t.tab} type="button" className={t.tab === tab ? 'on' : ''} onClick={() => setTab(t.tab)}>
            {t.label}
          </button>
        ))}
      </nav>
      {/* key: 탭을 바꾸면 검색 · 필터를 새로 */}
      {tab === 'filament' ? <FilamentsPage /> : <ItemsTab key={tab} kind={tab} />}
    </>
  )
}
