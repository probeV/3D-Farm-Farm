// 부자재 목록의 검색 · 정렬 · 요약 · 사용하는 제품 (PART-01 · PART-03, docs/screens.md 3장)
// 사용하는 제품 · 평균 부자재비는 서버가 주지 않는다. 제품 목록(/products/)의 부자재 줄로 계산 (docs/api.md "부자재")
import type { Part, Product, ProductStatus } from '../../api/products'
import { compareBy, type SortColumns, type SortState } from '../../sort'

const byName = (a: Part, b: Part) => a.name.localeCompare(b.name, 'ko')

// 열 제목 정렬 (PART-01). 가격 · 구매처가 없으면 방향과 상관없이 맨 뒤
export const SORT_COLUMNS = {
  name: { value: (p) => p.name },
  shop: { value: (p) => p.shop || null },
  price: { value: (p) => p.price, first: 'desc' },
  packQty: { value: (p) => p.pack_qty, first: 'desc' },
  unitPrice: { value: (p) => p.unit_price, first: 'desc' },
  used: { value: (p) => p.product_count, first: 'desc' },
} satisfies SortColumns<Part, string>

export type Sort = SortState<keyof typeof SORT_COLUMNS>

export interface ListFilter {
  q: string
  noPriceOnly: boolean // `가격 미입력` 카드를 눌러 가격이 없는 부자재만
  sort: Sort
}

export const NO_FILTER: ListFilter = { q: '', noPriceOnly: false, sort: { key: 'name', dir: 'asc' } }

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
        (!q || [p.name, p.shop, p.note].join(' ').toLowerCase().includes(q)),
    )
    .sort(compareBy(SORT_COLUMNS, filter.sort, byName))
}

// 제품 1개의 부자재비. 가격이 없는 부자재는 0원 (제품 원가 계산과 같음)
export function partsCost(product: Product, parts: Map<number, Part>) {
  return product.parts.reduce((sum, row) => sum + (parts.get(row.part)?.unit_price ?? 0) * row.qty, 0)
}

// 맨 위 요약 (PART-03). 평균 부자재비는 판매중이고 부자재를 쓰는 제품만
export function summarize(parts: Part[], products: Product[]) {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const base = products.filter((p) => p.status === 'on_sale' && p.parts.length)
  const used = parts.filter((p) => p.product_count > 0).length
  return {
    total: parts.length,
    used,
    unused: parts.length - used,
    noPrice: parts.filter((p) => p.price == null).length,
    avgPartsCost: base.length ? base.reduce((sum, p) => sum + partsCost(p, byId), 0) / base.length : null,
    avgBase: base.length, // 평균에 들어간 제품 수 (툴팁용)
  }
}

// 부자재 관리 창 왼쪽 선택: '' = 전체, 's:쿠팡' = 그 구매처, 'none' = 구매처 없음
export type ShopSel = '' | 'none' | `s:${string}`

export const inShop = (part: Part, sel: ShopSel) =>
  sel === '' || (sel === 'none' ? !part.shop : part.shop === sel.slice(2))

export const shopsOf = (parts: Part[]) =>
  [...new Set(parts.map((p) => p.shop).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
