// 판매 화면 API (docs/api.md "판매")
// 요약 · 제품별 판매 · 검색 · 기간 필터는 서버가 주지 않는다. 화면이 pages/sales/saleList.ts 로 계산한다
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, send } from './client'

// 판매처 (고정 3개). 이름은 pages/sales/channels.ts
export type SaleChannel = 'store' | 'direct' | 'etc'

export interface SaleItem {
  id: number
  product: number | null // 제품을 지우면 null (팔 때 이름은 product_name 에 남음)
  product_name: string
  qty: number
  unit_price: number
  unit_cost: number | null // 팔 때 복사한 개당 원가, null = 원가 없음
  store_item_id: string // 스마트스토어 상품주문번호 (가져온 줄). 직접 넣은 줄은 '' — 고칠 때 그대로 보내야 다음 가져오기 때 맞춤
  amount: number // 단가 × 수량 (읽기만)
}

// 주문의 부속품 줄 — 이 판매로 남은 수량에서 빠지는 부속품. 처음엔 제품의 사용 부속품 × 수량, 판매마다 바꿀 수 있음
export interface SalePart {
  id: number
  part: number | null // 부속품을 지우면 null (이름은 part_name 에 남음)
  part_name: string
  qty: number
}

// 주문의 포장 줄 (SALE-06). 단가는 팔 때 복사 (unit_price 를 안 보내면 서버가 포장재의 지금 단가로)
export interface SalePack {
  id: number
  part: number | null // 포장재를 지우면 null (이름은 part_name 에 남음)
  part_name: string
  qty: number
  unit_price: number | null // null = 구매가 없음 (0원)
  amount: number | null // 단가 × 수량 (읽기만)
}

export interface Sale {
  id: number
  date: string // "2026-10-23"
  channel: SaleChannel
  order_no: string // 빈 문자열 = 없음
  items: SaleItem[]
  parts: SalePart[]
  packs: SalePack[]
  shipping_received: number // 손님이 낸 배송비
  fee: number
  shipping_cost: number // 판매자가 낸 택배비 (주문별 이익 참고용)
  note: string
  // 읽기만 (서버 계산)
  gross: number // 판매가 합계
  settle: number // 정산 금액 = gross + shipping_received − fee
  pack_cost: number // 포장비 = Σ 포장 줄 금액 (원 단위)
  cost: number | null // 원가 합계 (제품 + 포장). 원가 없는 제품 줄이 있으면 null
  profit: number | null // 주문별 이익 = settle − cost − shipping_cost
  created_at: string
}

export const keys = { sales: ['sales'] as const }

// 최근 날짜순 (같은 날이면 나중에 넣은 것 먼저)
export const useSales = () => useQuery({ queryKey: keys.sales, queryFn: () => api<Sale[]>('/sales/') })

export function useRefreshSales() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.sales })
}

// ---------------------------------------------------------------- 쓰기

export type SaleItemInput = Omit<SaleItem, 'id' | 'amount'>
export type SalePartInput = Omit<SalePart, 'id'>
export type SalePackInput = Omit<SalePack, 'id' | 'amount'>
export type SaleInput = Omit<
  Sale,
  'id' | 'items' | 'parts' | 'packs' | 'gross' | 'settle' | 'pack_cost' | 'cost' | 'profit' | 'created_at'
> & {
  items: SaleItemInput[]
  parts: SalePartInput[]
  packs: SalePackInput[]
}

// items · parts · packs 를 보내면 그 목록으로 통째로 바꾼다 (보내지 않으면 줄은 그대로 — 화면은 늘 셋 다 보냄).
// 저장하면 서버가 부속품 줄 · 포장 줄만큼 남은 수량에서 뺀다 (고치면 차이만) → 재고 쪽 목록도 다시 불러온다
// 같은 주문번호가 이미 있으면 400 `{"order_no": ["이미 넣은 주문번호입니다."]}`
export const createSale = (body: SaleInput) => send<Sale>('POST', '/sales/', body)
export const updateSale = (id: number, body: Partial<SaleInput>) => send<Sale>('PATCH', `/sales/${id}/`, body)
export const deleteSale = (id: number) => send<null>('DELETE', `/sales/${id}/`)
