// 손익 화면 API (docs/api.md "손익")
// 서버는 달마다 합계만 준다. 두 기준 계산 · 연 · 전체 합계 · 투자 회수는 화면이 pages/pl/plCalc.ts 로 한다
import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { ExpenseCategory } from './expenses'

// 한 달 합계. 기록이 있는 첫 달부터 이번 달까지 빈 달도 0 으로 온다 (오래된 달부터)
export interface PlMonth {
  month: string // "2026-10"
  gross: number // 판매가 합계 (판매 장부)
  shipping: number // 받은 배송비
  fee: number // 판매 수수료
  sales: number // 판매 건수
  spool: number // 그 달에 사용 시작한 스풀 구매가 합계 (없으면 색상 → 필라멘트 가격)
  spools: number // 사용 시작한 스풀 수
  spools_unpriced: number // 그중 가격을 알 수 없는 스풀 (0원으로 들어감)
  parts_used: number // 부속품 · 포장재 쓴 만큼 = 판매로 빠진 것 + 조정(처음 수량 빼고) × 그때 단가 (손익 기준)
  parts_unpriced: number // 그중 단가가 없던 기록 수 (0원으로 들어감)
  expenses: Record<ExpenseCategory, number> // 지출 분류별 합계 (9개 모두)
}

export const keys = { pl: ['pl'] as const }

// 판매 · 지출 · 스풀이 바뀌면 다른 화면에서 고치므로, 이 화면을 열 때마다 새로 받는다 (기본 staleTime 0)
export const usePl = () =>
  useQuery({ queryKey: keys.pl, queryFn: () => api<{ months: PlMonth[] }>('/pl/').then((r) => r.months) })
