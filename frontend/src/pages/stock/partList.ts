// 재고 관리 탭(부속품 · 포장 · 소모품) 목록의 검색 · 정렬 · 요약 · 사용하는 제품 · 포장 세트 계산
// (PART-01 · STOCK-02 · 04 · 06, docs/screens.md 3장). 서버는 품목 · 세트 · 제품을 주고 계산은 여기서 (docs/api.md "재고 관리")
import type { PackSet, Part, Product, ProductStatus } from '../../api/products'
import { compareBy, type SortColumns, type SortState } from '../../sort'
import { levelOf } from './kinds'

const byName = (a: Part, b: Part) => a.name.localeCompare(b.name, 'ko')

// 열 제목 정렬 (PART-01). 가격 · 구매처가 없으면 방향과 상관없이 맨 뒤
export const SORT_COLUMNS = {
  name: { value: (p) => p.name },
  shop: { value: (p) => p.shop || null },
  price: { value: (p) => p.price, first: 'desc' },
  packQty: { value: (p) => p.pack_qty, first: 'desc' },
  unitPrice: { value: (p) => p.unit_price, first: 'desc' },
  used: { value: (p) => p.product_count, first: 'desc' },
  sets: { value: (p) => p.set_count, first: 'desc' },
  stock: { value: (p) => p.stock, first: 'desc' },
  lastUsed: { value: (p) => p.last_used, first: 'desc' },
} satisfies SortColumns<Part, string>

export type Sort = SortState<keyof typeof SORT_COLUMNS>

export interface ListFilter {
  q: string
  category: CategorySel // 카테고리 필터

  noPriceOnly: boolean // `가격 미입력` 카드를 눌러 가격이 없는 품목만
  lowOnly: boolean // `부족 · 없음` 카드를 눌러 그 품목만 (STOCK-04)
  sort: Sort
}

export const NO_FILTER: ListFilter = {
  q: '',
  category: '',
  noPriceOnly: false,
  lowOnly: false,
  sort: { key: 'name', dir: 'asc' },
}

// 카테고리 선택: '' = 전체, 'c:3' = 그 카테고리, 'none' = 미분류 (목록 필터 · 부자재 관리 창 카테고리별 보기)
export type CategorySel = '' | 'none' | `c:${number}`

export const inCategory = (part: Part, sel: CategorySel) =>
  sel === '' || (sel === 'none' ? part.category == null : part.category === Number(sel.slice(2)))

export interface Usage {
  productId: number
  name: string
  status: ProductStatus
  qty: number // 제품 1개에 드는 수량 (같은 부자재 줄이 여러 개면 합계)
}

// 부자재 id → 그 부자재를 쓰는 제품 (제품 이름순)
export function usagesByPart(products: Product[]) {
  const out = new Map<number, Usage[]>()
  for (const product of [...products].sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
    for (const row of product.parts) {
      const list = out.get(row.part) ?? []
      const same = list.find((u) => u.productId === product.id)
      if (same) same.qty += row.qty
      else list.push({ productId: product.id, name: product.name, status: product.status, qty: row.qty })
      out.set(row.part, list)
    }
  }
  return out
}

// 검색: 품목 · 구매처 · 비고
export function filterParts(parts: Part[], filter: ListFilter) {
  const q = filter.q.trim().toLowerCase()
  return parts
    .filter(
      (p) =>
        (!filter.noPriceOnly || p.price == null) &&
        (!filter.lowOnly || levelOf(p) !== 'ok') &&
        inCategory(p, filter.category) &&
        (!q || [p.name, p.shop, p.note].join(' ').toLowerCase().includes(q)),
    )
    .sort(compareBy(SORT_COLUMNS, filter.sort, byName))
}

// 제품 1개의 부자재비. 가격이 없는 부자재는 0원 (제품 원가 계산과 같음)
export function partsCost(product: Product, parts: Map<number, Part>) {
  return product.parts.reduce((sum, row) => sum + (parts.get(row.part)?.unit_price ?? 0) * row.qty, 0)
}

// 맨 위 요약 (PART-03 · STOCK-04). 한 탭의 품목만 넘긴다
export function summarize(parts: Part[]) {
  const used = parts.filter((p) => p.product_count > 0).length
  return {
    total: parts.length,
    used, // 제품에서 쓰는 부속품
    unused: parts.length - used,
    noPrice: parts.filter((p) => p.price == null).length,
    low: parts.filter((p) => levelOf(p) !== 'ok'), // 부족 · 없음
    // 남은 금액 = Σ 남은 수량 × 개당 단가 (0 아래 · 가격 없는 것은 0)
    value: parts.reduce((sum, p) => sum + Math.max(0, p.stock) * (p.unit_price ?? 0), 0),
  }
}

// ---------------------------------------------------------------- 포장 세트 (STOCK-06)

// 세트 원가 = Σ 수량 × 포장재 개당 단가 (가격 없는 포장재는 0원)
export function setCost(set: Pick<PackSet, 'lines'>, parts: Map<number, Part>) {
  return set.lines.reduce((sum, l) => sum + (parts.get(l.part)?.unit_price ?? 0) * l.qty, 0)
}

// 지금 남은 수량으로 몇 번 쌀 수 있나 (가장 모자란 포장재 기준)
export function canPack(set: PackSet, parts: Map<number, Part>) {
  if (!set.lines.length) return 0
  return Math.min(...set.lines.map((l) => Math.floor(Math.max(0, parts.get(l.part)?.stock ?? 0) / l.qty)))
}

// 포장재 id → 그 포장재를 쓰는 세트 (이름순)
export function setsByPart(sets: PackSet[]) {
  const out = new Map<number, PackSet[]>()
  for (const set of [...sets].sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
    for (const l of set.lines) out.set(l.part, [...(out.get(l.part) ?? []), set])
  }
  return out
}

// 부자재 관리 창 왼쪽 선택: '' = 전체, 's:쿠팡' = 그 구매처, 'none' = 구매처 없음
export type ShopSel = '' | 'none' | `s:${string}`

export const inShop = (part: Part, sel: ShopSel) =>
  sel === '' || (sel === 'none' ? !part.shop : part.shop === sel.slice(2))

export const shopsOf = (parts: Part[]) =>
  [...new Set(parts.map((p) => p.shop).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
