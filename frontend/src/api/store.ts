// 스마트스토어 연동 API (docs/api.md "스마트스토어 연동", v2 STORE)
// 네이버를 부르는 건 연결 확인 · 주문 미리보기 · 넣기뿐. 키 · 토큰은 서버에만 있다
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, send } from './client'

export type ConnState = 'ok' | 'nokey' | 'fail'

export interface StoreImport {
  id: number
  created_at: string
  date_from: string
  date_to: string
  added: number // 판매 장부에 넣은 주문
  updated: number // 맞춘 주문 (취소 · 반품 · 금액 변경)
  skipped: number // 뺀 주문
  note: string
}

export interface Connection {
  state: ConnState
  detail: string // 실패 이유 (네이버 오류 코드 · 문구)
  last_import: StoreImport | null
}

// 미리보기 주문의 할 일 (서버 smartstore/services.py classify)
export type OrderKind = 'ok' | 'need' | 'cancel' | 'wait' | 'dup' | 'sync' | 'gone'

export interface StoreLine {
  store_item_id: string // 상품주문번호
  store_product_id: string
  store_name: string
  option: string // `글자: A / 스위치: 청축`
  qty: number // 남은 수량
  amount: number // 남은 결제 금액
  status: string
  status_label: string
  alive: boolean // 취소 · 반품 · 결제 전이 아님
  link: number | null // 고른 상품 연결 줄 id
  product: number | null
  product_name: string | null
}

export interface StoreOrder {
  order_id: string
  date: string // 결제일
  kind: OrderKind
  manual: boolean // 주문번호만 같은 직접 넣은 판매 (맞추지 않음)
  sale: number | null // 이미 있는 판매 id
  status: string
  status_label: string
  changes: string[] // sync: `ABC 1구 클리커 150개 → 100개` …
  gross: number
  shipping: number
  fee: number
  settle: number // 이 앱의 정산 금액 = gross + shipping − fee
  naver_settle: number // 네이버 정산 예정 금액 합계
  lines: StoreLine[]
}

export interface StoreLink {
  id: number
  store_product_id: string
  store_name: string
  option: string // '' = 기본 연결
  product: number | null
  product_name: string | null
  updated_at: string
}

export const keys = {
  connection: ['store', 'connection'] as const,
  links: ['store', 'links'] as const,
  imports: ['store', 'imports'] as const,
}

// 연결 상태 (GET 은 받아 둔 토큰으로 — 화면을 열 때마다 네이버를 부르지는 않음)
export const useConnection = () =>
  useQuery({ queryKey: keys.connection, queryFn: () => api<Connection>('/store/connection/'), staleTime: 60_000 })

export const useStoreLinks = () => useQuery({ queryKey: keys.links, queryFn: () => api<StoreLink[]>('/store/links/') })

export const useStoreImports = () =>
  useQuery({ queryKey: keys.imports, queryFn: () => api<StoreImport[]>('/store/imports/') })

export function useRefreshStore() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['store'] })
}

// ---------------------------------------------------------------- 네이버를 부르는 것

// `연결 확인`: 토큰을 새로 받아 봄
export const checkConnection = () => send<Connection>('POST', '/store/connection/')

// 미리보기: 그 기간(31일까지)에 바뀐 주문. 처음 보는 스토어 상품은 서버가 연결 줄을 만든다
export const previewOrders = (from: string, to: string) =>
  api<{ orders: StoreOrder[] }>(`/store/orders/?date_from=${from}&date_to=${to}`).then((r) => r.orders)

export interface ImportInput {
  date_from: string
  date_to: string
  product_order_ids: string[] // 고른 주문의 상품주문번호 전부
  costs: Record<string, number | null> // 제품 id → 개당 원가(포장 빼고), 판매 창과 같은 값
  total: number // 미리보기에 보였던 주문 수
}

export const importOrders = (body: ImportInput) => send<StoreImport>('POST', '/store/orders/', body)

// ---------------------------------------------------------------- 상품 연결

export const updateStoreLink = (id: number, body: { product?: number | null; option?: string }) =>
  send<StoreLink>('PATCH', `/store/links/${id}/`, body)

export const createStoreLink = (body: { store_product_id: string; option: string; product: number | null }) =>
  send<StoreLink>('POST', '/store/links/', body)

export const deleteStoreLink = (id: number) => send<null>('DELETE', `/store/links/${id}/`)
