// 필라멘트 화면 API — 회사 · 재질 · 필라멘트 · 색상 · 스풀 (docs/api.md)
import { useQuery } from '@tanstack/react-query'
import { api } from './client'

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
}

export const useBrands = () => useQuery({ queryKey: keys.brands, queryFn: () => api<Brand[]>('/brands/') })

export const useMaterials = () => useQuery({ queryKey: keys.materials, queryFn: () => api<Material[]>('/materials/') })

// 필라멘트 화면은 이 목록 하나로 그린다 (색상 · 색상별 스풀 개수 포함)
export const useFilaments = () => useQuery({ queryKey: keys.filaments, queryFn: () => api<Filament[]>('/filaments/') })
