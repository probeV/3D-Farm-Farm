// 제품 원가 · 재고 관리 화면 API — 카테고리 · 세부 분류 · 재고 품목 · 포장 세트 · 제품 · 원가 설정
// (docs/api.md "재고 관리" · "제품 원가")
// 원가 · 순마진율은 서버가 주지 않는다. 화면이 pages/products/cost.ts 로 계산한다
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, send } from './client'

export type ProductStatus = 'on_sale' | 'developing' | 'discontinued'

export interface Subcategory {
  id: number
  category: number
  name: string
  product_count: number
}

export interface Category {
  id: number
  name: string
  product_count: number // 세부 분류에 있는 제품 포함
  subcategories: Subcategory[] // 이름순
}

// 재고 관리 탭 (v2 STOCK): 부속품 · 포장재 · 소모품. 이름은 pages/stock/kinds.ts
export type PartKind = 'part' | 'pack' | 'supply'

// 품목 카테고리 (탭마다 따로). 지우면 그 품목은 미분류 (category null)
export interface PartCategory {
  id: number
  kind: PartKind
  name: string
  part_count: number
}

export interface Part {
  id: number
  kind: PartKind // 만든 뒤 바꿀 수 없음
  name: string
  category: number | null // null = 미분류
  photo: string | null // "/media/parts/x.png"
  shop: string
  buy_url: string // 구매 링크, 빈 문자열 = 없음
  price: number | null // 묶음 구매가, null = 미입력
  pack_qty: number
  unit: string
  unit_price: number | null // 개당 단가 = 평균 단가 (원가 계산 · 판매 포장 줄 · 손익). 평균이 없으면 직접 넣은 구매가 ÷ 묶음 수량
  avg_price: number | null // 평균 단가 (이동평균 — 지출 구매 · 처음 수량을 남은 수량과 섞은 값, v2 PL)
  stock: number // 남은 수량 (0 아래 가능). 바꿀 때는 adjustPart · usePart
  note: string
  product_count: number // 쓰는 제품 수 (부속품)
  set_count: number // 쓰는 포장 세트 수 (포장재)
  last_used: string | null // 마지막으로 다 쓴 날 (소모품)
  bought: boolean // 지출로 산 적이 있음 → 구매가 · 묶음 수량은 못 고치고 쓰지 않음 (단가는 평균만)
}

// 포장 세트 (STOCK-06): 제품의 기본 포장 · 판매 주문의 포장 줄을 채운다
export interface PackSetLine {
  id: number
  part: number
  qty: number
}

export interface PackSet {
  id: number
  name: string
  note: string
  lines: PackSetLine[]
  product_count: number // 기본 포장으로 쓰는 제품 수
}

// 입출고 기록 (STOCK-05). qty 는 늘면 +, 줄면 −
export type HistoryKind = 'buy' | 'sale' | 'use' | 'adjust'
export interface StockHistory {
  id: number
  date: string
  kind: HistoryKind
  qty: number
  after: number // 그 뒤 남은 수량
  note: string
  sale: number | null
  created_at: string
}

// 사용 필라멘트 줄: color null = 색상 선택 안 함 (필라멘트 가격으로 계산)
export interface ProductFilament {
  id: number
  filament: number
  color: number | null
  grams: number
}

export interface ProductPart {
  id: number
  part: number
  qty: number
}

export interface Product {
  id: number
  category: number | null
  subcategory: number | null
  name: string
  status: ProductStatus
  print_minutes: number | null
  sale_price: number | null
  default_pack: number | null // 기본 포장 세트, null = 입력 필요
  note: string
  filaments: ProductFilament[]
  parts: ProductPart[]
  created_at: string
  updated_at: string
}

// % 값은 숫자 그대로 (1.98 = 1.98%)
export interface CostSetting {
  power_kw: number
  elec_rate: number
  fee_order: number
  fee_sales: number
  shipping_cost: number
  target_margin: number
  // 재고 관리 탭마다 부족 알림 기준 (v2.1.0). 남은 수량이 이 값 이하면 `부족`
  alert_part: number
  alert_pack: number
  alert_supply: number
}

export const keys = {
  categories: ['categories'] as const,
  parts: ['parts'] as const,
  partCategories: ['part-categories'] as const,
  packSets: ['pack-sets'] as const,
  history: ['part-history'] as const, // + 품목 id
  products: ['products'] as const,
  costSetting: ['cost-setting'] as const,
}

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api<Category[]>('/categories/') })

export const useParts = () => useQuery({ queryKey: keys.parts, queryFn: () => api<Part[]>('/parts/') })

export const usePartCategories = () =>
  useQuery({ queryKey: keys.partCategories, queryFn: () => api<PartCategory[]>('/part-categories/') })

export const usePackSets = () => useQuery({ queryKey: keys.packSets, queryFn: () => api<PackSet[]>('/pack-sets/') })

export const useHistory = (partId: number) =>
  useQuery({
    queryKey: [...keys.history, partId],
    queryFn: () => api<StockHistory[]>(`/parts/${partId}/history/`),
  })

// 제품 원가 화면은 이 목록 + 필라멘트 목록(/filaments/) + 재고 품목 + 포장 세트 + 설정으로 그린다
export const useProducts = () => useQuery({ queryKey: keys.products, queryFn: () => api<Product[]>('/products/') })

export const useCostSetting = () =>
  useQuery({ queryKey: keys.costSetting, queryFn: () => api<CostSetting>('/cost-setting/') })

// 저장한 뒤 다시 불러오기. 제품 수가 카테고리 · 부자재 목록에도 나오므로 제품 쪽 목록을 모두 무효화한다
export function useRefreshProducts() {
  const queryClient = useQueryClient()
  return () => Promise.all(Object.values(keys).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

// ---------------------------------------------------------------- 쓰기
// 제품이 있으면 카테고리 · 세부 분류 삭제 시 409 `{"detail": "제품이 있어서 삭제할 수 없습니다."}` (PRD-11)

export const createCategory = (body: { name: string }) => send<Category>('POST', '/categories/', body)
export const updateCategory = (id: number, body: { name: string }) =>
  send<Category>('PATCH', `/categories/${id}/`, body)
export const deleteCategory = (id: number) => send<null>('DELETE', `/categories/${id}/`)

// 세부 분류의 카테고리는 만든 뒤 바꿀 수 없다 (이름만 수정)
export const createSubcategory = (body: { category: number; name: string }) =>
  send<Subcategory>('POST', '/subcategories/', body)
export const updateSubcategory = (id: number, body: { name: string }) =>
  send<Subcategory>('PATCH', `/subcategories/${id}/`, body)
export const deleteSubcategory = (id: number) => send<null>('DELETE', `/subcategories/${id}/`)

// 원가 설정은 항상 1개라 id 없이 PATCH (PRD 3.8). 범위를 벗어나면 400 칸별 메시지
export const updateCostSetting = (body: Partial<CostSetting>) => send<CostSetting>('PATCH', '/cost-setting/', body)

// 품목 이름이 겹치면 400 `{"name": ["이미 있는 품목입니다."]}`, 제품 · 포장 세트에서 쓰면 삭제 시 409 (PART-02)
// kind · stock 은 추가할 때만 (stock = 지금 가진 수량). 사진은 FormData 로 photo 파일, 지울 때는 JSON {photo: null}
export interface PartInput {
  kind: PartKind
  name: string
  category: number | null
  stock?: number
  shop: string
  buy_url: string
  price: number | null
  pack_qty: number
  unit: string
  note: string
}
export const createPart = (body: PartInput | FormData) => send<Part>('POST', '/parts/', body)
export const updatePart = (id: number, body: Partial<Omit<PartInput, 'kind' | 'stock'>> | FormData | { photo: null }) =>
  send<Part>('PATCH', `/parts/${id}/`, body)
export const deletePart = (id: number) => send<null>('DELETE', `/parts/${id}/`)

// 남은 수량 조정 (STOCK-04): set 실제 수량으로 맞추기 · sub 빼기 · add 더하기 → 바뀐 품목
export type AdjustMode = 'set' | 'sub' | 'add'
export const adjustPart = (id: number, body: { mode: AdjustMode; qty: number; note: string }) =>
  send<Part>('POST', `/parts/${id}/adjust/`, body)
// 소모품 1개 다 씀 (STOCK-07) → 바뀐 품목
export const spendPart = (id: number, note = '') => send<Part>('POST', `/parts/${id}/use/`, { note })

// 포장 세트: 이름이 겹치면 400, 기본 포장으로 쓰는 제품이 있으면 삭제 409. lines 는 보내면 통째로 바꿈
export interface PackSetInput {
  name: string
  note: string
  lines: Omit<PackSetLine, 'id'>[]
}
export const createPackSet = (body: PackSetInput) => send<PackSet>('POST', '/pack-sets/', body)
export const updatePackSet = (id: number, body: Partial<PackSetInput>) =>
  send<PackSet>('PATCH', `/pack-sets/${id}/`, body)
export const deletePackSet = (id: number) => send<null>('DELETE', `/pack-sets/${id}/`)

// 제품의 부자재 바꾸기 (TBD-23): 제품에서 쓰는 이 부자재 줄을 to 로. products 를 비우면 쓰는 제품 전부.
// 수량은 그대로, 그 제품에 이미 to 가 있으면 수량을 더해 한 줄로. 서버가 한 번에 처리 (하나라도 실패하면 아무것도 안 바꿈)
export const replacePart = (id: number, body: { to: number; products?: number[] }) =>
  send<{ replaced: number }>('POST', `/parts/${id}/replace/`, body)

// 부자재 카테고리: 이름이 겹치면 400 `{"name": ["이미 있는 카테고리 이름입니다."]}`. 지우면 그 부자재는 미분류 (204)
export const createPartCategory = (body: { kind: PartKind; name: string }) =>
  send<PartCategory>('POST', '/part-categories/', body)
export const updatePartCategory = (id: number, body: { name: string }) =>
  send<PartCategory>('PATCH', `/part-categories/${id}/`, body)
export const deletePartCategory = (id: number) => send<null>('DELETE', `/part-categories/${id}/`)

export interface ProductInput {
  no?: number // 비우면 서버가 다음 번호
  category: number | null
  subcategory: number | null
  name: string
  status: ProductStatus
  print_minutes: number | null
  sale_price: number | null
  default_pack: number | null
  note: string
  // 보내면 그 목록으로 줄을 통째로 바꾼다 (줄 id 가 새로 생김)
  filaments: Omit<ProductFilament, 'id'>[]
  parts: Omit<ProductPart, 'id'>[]
}
export const createProduct = (body: ProductInput) => send<Product>('POST', '/products/', body)
export const updateProduct = (id: number, body: Partial<ProductInput>) =>
  send<Product>('PATCH', `/products/${id}/`, body)
export const deleteProduct = (id: number) => send<null>('DELETE', `/products/${id}/`)
