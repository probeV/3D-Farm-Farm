// 카테고리 · 세부 분류 고르기 — 목록의 카테고리 필터와 제품 관리 창 왼쪽 목록이 같이 쓴다
import type { Category, Subcategory } from '../../api/products'

// '' 전체 / 'none' 미분류 / 'c:1' 카테고리(세부 분류 제품 포함) / 's:2' 세부 분류
export type CategorySel = '' | 'none' | `c:${number}` | `s:${number}`

interface Classified {
  category: number | null
  subcategory: number | null
}

export function inSelection(p: Classified, sel: CategorySel) {
  if (sel === '') return true
  if (sel === 'none') return p.category == null
  const id = Number(sel.slice(2))
  return sel.startsWith('c:') ? p.category === id : p.subcategory === id
}

export const findSubcategory = (categories: Category[], id: number | null): Subcategory | undefined =>
  id == null ? undefined : categories.flatMap((c) => c.subcategories).find((s) => s.id === id)

// "수업 교구", "수업 교구 › 수학", "미분류"
export function selectionLabel(categories: Category[], sel: CategorySel) {
  if (sel === '') return '전체'
  if (sel === 'none') return '미분류'
  const id = Number(sel.slice(2))
  if (sel.startsWith('c:')) return categories.find((c) => c.id === id)?.name ?? ''
  const sub = findSubcategory(categories, id)
  const category = categories.find((c) => c.id === sub?.category)
  return sub ? `${category?.name} › ${sub.name}` : ''
}

// 고른 것이 지워졌으면 false (제품 관리 창에서 다른 것으로 바꿈)
export function selectionExists(categories: Category[], sel: CategorySel, hasUncategorized: boolean) {
  if (sel === '') return true
  if (sel === 'none') return hasUncategorized
  const id = Number(sel.slice(2))
  return sel.startsWith('c:') ? categories.some((c) => c.id === id) : !!findSubcategory(categories, id)
}
