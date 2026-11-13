// 필라멘트 화면 API — 회사 · 재질 · 필라멘트 · 색상 · 스풀 (docs/api.md)
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, send } from './client'
import { keys as expenseKeys } from './expenses'

export type SpoolStatus = 'sealed' | 'open' | 'empty'

// 상태별 값 (스풀 개수 또는 kg)
export type ByStatus = Record<SpoolStatus, number>

export interface Brand {
  id: number
  name: string
  logo: string | null
  filament_count: number
}

export interface Material {
  id: number
  name: string
  filament_count: number
}

// 최근 구매 (지출 장부의 구매 항목, v2 TBD-31 · 33). 가격 옆 `최근 구매가 · 날짜 주문명 (지출)`
export interface LastBuy {
  expense: number
  date: string
  name: string
}

export interface Color {
  id: number
  filament: number
  name: string
  hex: string
  price: number | null
  spool_price: number | null
  price_per_g: number | null
  counts: ByStatus
  last_buy: LastBuy | null // 있으면 price 는 그 지출의 롤당 금액 (다음 구매 때 다시 바뀜)
}

export interface Filament {
  id: number
  brand: number
  brand_name: string
  material: number
  material_name: string
  series: string
  display_name: string
  price: number | null
  spool_g: number
  avg_held_price: number | null
  colors: Color[]
}

export interface Spool {
  id: number
  code: string
  code_no: number
  color: number
  status: SpoolStatus
  price: number | null
  purchased_at: string
  opened_at: string | null
  finished_at: string | null
  note: string
  buy: number | null // 주문(지출 구매 항목) id — 필라멘트 지출을 저장하면 정해짐. 있으면 구매가는 지출에서만 (TBD-33)
}

export const keys = {
  brands: ['brands'] as const,
  materials: ['materials'] as const,
  filaments: ['filaments'] as const,
  spools: ['spools'] as const,
}

export const useBrands = () => useQuery({ queryKey: keys.brands, queryFn: () => api<Brand[]>('/brands/') })

export const useMaterials = () => useQuery({ queryKey: keys.materials, queryFn: () => api<Material[]>('/materials/') })

// 필라멘트 화면은 이 목록 하나로 그린다 (색상 · 색상별 스풀 개수 포함)
export const useFilaments = () => useQuery({ queryKey: keys.filaments, queryFn: () => api<Filament[]>('/filaments/') })

// 저장한 뒤 다시 불러오기. 이름 · 개수 · 가격이 여러 목록(회사 카드, 관리 창, 타일, 스풀 창)에 함께 나오므로
// 필라멘트 쪽 목록을 모두 무효화한다 (@CacheEvict(allEntries)). 지출 목록도 — 구매 항목의 스풀 수 · 사용한 수가 바뀌어서 (TBD-33)
export function useRefreshFilaments() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [...Object.values(keys), expenseKeys.expenses].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
}

// 한 색상의 스풀 목록 (번호 순서). status 를 주면 그 상태만 — 스풀 선택 · 조정 창
export const useSpools = (color: number, status?: SpoolStatus) =>
  useQuery({
    queryKey: [...keys.spools, { color, status }],
    queryFn: () => api<Spool[]>(`/spools/?color=${color}${status ? `&status=${status}` : ''}`),
  })

// ---------------------------------------------------------------- 쓰기: 회사 · 재질 · 필라멘트 · 색상
// 삭제할 수 없으면 409 `{"detail": "필라멘트가 있어서 삭제할 수 없습니다."}` (PRD FIL-09)

// 회사: 로고 파일을 올릴 때는 FormData(multipart), 로고를 지울 때는 JSON {"logo": null} (docs/api.md "로고 올리기 · 지우기")
export const createBrand = (body: FormData | { name: string }) => send<Brand>('POST', '/brands/', body)
export const updateBrand = (id: number, body: FormData | { name?: string; logo?: null }) =>
  send<Brand>('PATCH', `/brands/${id}/`, body)
export const deleteBrand = (id: number) => send<null>('DELETE', `/brands/${id}/`)

export const createMaterial = (body: { name: string }) => send<Material>('POST', '/materials/', body)
export const updateMaterial = (id: number, body: { name: string }) => send<Material>('PATCH', `/materials/${id}/`, body)
export const deleteMaterial = (id: number) => send<null>('DELETE', `/materials/${id}/`)

export interface FilamentInput {
  brand: number
  material: number
  series: string
  price: number | null
  spool_g: number
}
export const createFilament = (body: FilamentInput) => send<Filament>('POST', '/filaments/', body)
export const updateFilament = (id: number, body: Partial<FilamentInput>) =>
  send<Filament>('PATCH', `/filaments/${id}/`, body)
export const deleteFilament = (id: number) => send<null>('DELETE', `/filaments/${id}/`)

export interface ColorInput {
  filament: number
  name: string
  hex: string
  price: number | null // 비우면 필라멘트 가격을 따름
}
export const createColor = (body: ColorInput) => send<Color>('POST', '/colors/', body)
export const updateColor = (id: number, body: Partial<ColorInput>) => send<Color>('PATCH', `/colors/${id}/`, body)
export const deleteColor = (id: number) => send<null>('DELETE', `/colors/${id}/`)

// ---------------------------------------------------------------- 쓰기: 스풀

export interface PurchaseInput {
  quantity: number
  purchased_at: string
  price?: number // 비우면 색상의 spool_price
}

// 재고 추가 → 만든 스풀 목록 (번호 순서)
export const addSpools = (color: number, input: PurchaseInput) =>
  send<Spool[]>('POST', `/colors/${color}/spools/`, input)

// 상태만 보내면 날짜 규칙을 서버가 적용, 날짜를 같이 보내면 그대로 저장 (되돌리기)
export const updateSpool = (id: number, patch: Partial<Omit<Spool, 'id' | 'code' | 'code_no'>>) =>
  send<Spool>('PATCH', `/spools/${id}/`, patch)

// 지운 스풀 되살리기: 내용(code_no · buy 포함)을 그대로 보내면 같은 코드 · 주문으로 다시 생김
export const createSpool = (spool: Omit<Spool, 'id' | 'code'>) => send<Spool>('POST', '/spools/', spool)

export const deleteSpool = (id: number) => send<null>('DELETE', `/spools/${id}/`)

export const deleteSpools = (ids: number[]) => send<{ deleted: number }>('DELETE', `/spools/?ids=${ids.join(',')}`)
