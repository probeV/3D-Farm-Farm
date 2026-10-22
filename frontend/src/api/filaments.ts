// 필라멘트 화면 API — 회사 · 재질 · 필라멘트 · 색상 · 스풀 (docs/api.md)
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, send } from './client'

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

export interface Color {
  id: number
  filament: number
  name: string
  hex: string
  price: number | null
  spool_price: number | null
  price_per_g: number | null
  counts: ByStatus
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
// 필라멘트 쪽 목록을 모두 무효화한다 (@CacheEvict(allEntries))
export function useRefreshFilaments() {
  const queryClient = useQueryClient()
  return () => Promise.all(Object.values(keys).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

// 한 색상의 스풀 목록 (번호 순서). status 를 주면 그 상태만 — 스풀 선택 · 조정 창
export const useSpools = (color: number, status?: SpoolStatus) =>
  useQuery({
    queryKey: [...keys.spools, { color, status }],
    queryFn: () => api<Spool[]>(`/spools/?color=${color}${status ? `&status=${status}` : ''}`),
  })

// ---------------------------------------------------------------- 쓰기: 스풀

export interface PurchaseInput {
  quantity: number
  purchased_at: string
  price?: number // 비우면 색상의 spool_price
  code_nos?: number[] // 쓰고 싶은 스풀 번호. 모자란 만큼은 자동
}

// 재고 추가 → 만든 스풀 목록 (번호 순서)
export const addSpools = (color: number, input: PurchaseInput) =>
  send<Spool[]>('POST', `/colors/${color}/spools/`, input)

// 상태만 보내면 날짜 규칙을 서버가 적용, 날짜를 같이 보내면 그대로 저장 (되돌리기)
export const updateSpool = (id: number, patch: Partial<Omit<Spool, 'id' | 'code' | 'code_no'>>) =>
  send<Spool>('PATCH', `/spools/${id}/`, patch)

// 지운 스풀 되살리기: 내용(code_no 포함)을 그대로 보내면 같은 코드로 다시 생김
export const createSpool = (spool: Omit<Spool, 'id' | 'code'>) => send<Spool>('POST', '/spools/', spool)

export const deleteSpool = (id: number) => send<null>('DELETE', `/spools/${id}/`)

export const deleteSpools = (ids: number[]) => send<{ deleted: number }>('DELETE', `/spools/?ids=${ids.join(',')}`)
