// 제품 원가 화면 API — 카테고리 · 세부 분류 · 부자재 · 제품 · 원가 설정 (docs/api.md "제품 원가")
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

export interface Part {
  id: number
  name: string
  shop: string
  price: number | null // 묶음 구매가, null = 미입력
  pack_qty: number
  unit: string
  unit_price: number | null // price ÷ pack_qty
  note: string
  product_count: number
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
  no: number
  category: number | null
  subcategory: number | null
  name: string
  status: ProductStatus
  print_minutes: number | null
  sale_price: number | null
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
  printer_price: number
  printer_life_hours: number
  failure_rate: number
  fee_order: number
  fee_sales: number
  shipping_cost: number
  target_margin: number
}

export const keys = {
  categories: ['categories'] as const,
  parts: ['parts'] as const,
  products: ['products'] as const,
  costSetting: ['cost-setting'] as const,
}

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => api<Category[]>('/categories/') })

export const useParts = () => useQuery({ queryKey: keys.parts, queryFn: () => api<Part[]>('/parts/') })

// 제품 원가 화면은 이 목록 + 필라멘트 목록(/filaments/) + 부자재 + 설정으로 그린다
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

// 품목 이름이 겹치면 400 `{"name": ["이미 있는 품목입니다."]}`, 제품에서 쓰면 삭제 시 409 (PART-02)
export interface PartInput {
  name: string
  shop: string
  price: number | null
  pack_qty: number
  unit: string
  note: string
}
export const createPart = (body: PartInput) => send<Part>('POST', '/parts/', body)
export const updatePart = (id: number, body: Partial<PartInput>) => send<Part>('PATCH', `/parts/${id}/`, body)
export const deletePart = (id: number) => send<null>('DELETE', `/parts/${id}/`)

export interface ProductInput {
  no?: number // 비우면 서버가 다음 번호
  category: number | null
  subcategory: number | null
  name: string
  status: ProductStatus
  print_minutes: number | null
  sale_price: number | null
  note: string
  // 보내면 그 목록으로 줄을 통째로 바꾼다 (줄 id 가 새로 생김)
  filaments: Omit<ProductFilament, 'id'>[]
  parts: Omit<ProductPart, 'id'>[]
}
export const createProduct = (body: ProductInput) => send<Product>('POST', '/products/', body)
export const updateProduct = (id: number, body: Partial<ProductInput>) =>
  send<Product>('PATCH', `/products/${id}/`, body)
export const deleteProduct = (id: number) => send<null>('DELETE', `/products/${id}/`)
