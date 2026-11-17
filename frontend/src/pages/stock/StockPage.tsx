import { useState } from 'react'
import type { LabelPick } from '../../nav'
import FilamentsPage from '../filaments/FilamentsPage'
import LabelsPage from '../filaments/qr/LabelsPage'
import ItemsTab from './ItemsTab'
import { TABS, type StockTab } from './kinds'

// 재고 관리 (STOCK-01, docs/screens.md 3장): 사이드바 `재고 관리` 하나, 화면 위 탭 `필라멘트 | 부속품 | 포장 | 소모품`.
// 필라멘트 탭은 기존 필라멘트 화면 그대로 (QR 도 그 안 — labels 가 있으면 QR 라벨 인쇄 화면). 나머지는 같은 화면을 탭(kind)으로 나눠 쓴다
export default function StockPage({
  labels,
  onCloseLabels,
  onSettings,
}: {
  labels: { pick: LabelPick | null; key: number } | null
  onCloseLabels: () => void
  onSettings: () => void // 설정 › 재고 관리 (부족 알림 기준)
}) {
  const [tab, setTab] = useState<StockTab>('filament')
  return (
    <>
      <nav className="stock-tabs">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            className={t.tab === (labels ? 'filament' : tab) ? 'on' : ''}
            onClick={() => {
              onCloseLabels()
              setTab(t.tab)
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {/* key: 탭을 바꾸면 검색 · 필터를 새로 */}
      {labels ? (
        <LabelsPage
          key={labels.key}
          pick={labels.pick}
          onBack={() => {
            setTab('filament')
            onCloseLabels()
          }}
        />
      ) : tab === 'filament' ? (
        <FilamentsPage />
      ) : (
        <ItemsTab key={tab} kind={tab} onSettings={onSettings} />
      )}
    </>
  )
}
