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
  amount: number // 단가 × 수량 (읽기만)
}

export interface Sale {
  id: number
  date: string // "2026-10-23"
  channel: SaleChannel
  order_no: string // 빈 문자열 = 없음
  items: SaleItem[]
  shipping_received: number // 손님이 낸 배송비
  fee: number
  shipping_cost: number // 판매자가 낸 택배비 (주문별 이익 참고용)
  note: string
  // 읽기만 (서버 계산)
  gross: number // 판매가 합계
  settle: number // 정산 금액 = gross + shipping_received − fee
  cost: number | null // 원가 합계. 원가 없는 줄이 있으면 null
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
export type SaleInput = Omit<Sale, 'id' | 'items' | 'gross' | 'settle' | 'cost' | 'profit' | 'created_at'> & {
  items: SaleItemInput[]
}

// items 를 보내면 그 목록으로 통째로 바꾼다 (보내지 않으면 줄은 그대로).
// 같은 주문번호가 이미 있으면 400 `{"order_no": ["이미 넣은 주문번호입니다."]}`
export const createSale = (body: SaleInput) => send<Sale>('POST', '/sales/', body)
export const updateSale = (id: number, body: Partial<SaleInput>) => send<Sale>('PATCH', `/sales/${id}/`, body)
export const deleteSale = (id: number) => send<null>('DELETE', `/sales/${id}/`)
