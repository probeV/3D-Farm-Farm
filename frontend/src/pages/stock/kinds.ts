// 재고 관리 탭 (v2 STOCK, docs/screens.md 3장). 필라멘트 탭은 pages/filaments, 나머지 셋은 같은 화면(ItemsTab)을 kind 로 나눠 쓴다
import type { Part, PartKind } from '../../api/products'

export type StockTab = 'filament' | PartKind

export const TABS: { tab: StockTab; label: string }[] = [
  { tab: 'filament', label: '필라멘트' },
  { tab: 'part', label: '부속품' },
  { tab: 'pack', label: '포장' },
  { tab: 'supply', label: '소모품' },
]

// 품목 이름 (탭 이름과 다른 것: 포장 탭의 품목은 `포장재`)
export const KIND_LABEL: Record<PartKind, string> = { part: '부속품', pack: '포장재', supply: '소모품' }

// 카테고리 이름 예시 (카테고리 추가 창)
export const CATEGORY_EXAMPLE: Record<PartKind, string> = { part: '전자 부품', pack: '박스', supply: '접착 · 마감' }

// 남은 수량 상태 (STOCK-04): 0 이하 = 없음(빨강), 알림 기준 이하 = 부족(주황)
// 알림 기준은 탭마다 하나 — 설정 › 재고 관리 (v2.1.0)
export type Level = 'ok' | 'low' | 'out'
export const levelOf = (p: Pick<Part, 'stock'>, alert: number): Level =>
  p.stock <= 0 ? 'out' : p.stock <= alert ? 'low' : 'ok'

// 수량 표시: 소수는 2자리까지 (완충재 cm 등)
export const qty = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
