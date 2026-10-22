// 제품 목록의 검색 · 필터 · 정렬 (PRD-01b · PRD-03, docs/screens.md 2.3). 요약 · CSV 는 검색 · 필터와 상관없이 전체
import type { Color } from '../../../api/filaments'
import type { Product } from '../../../api/products'
import { inSelection, type CategorySel } from '../categories'
import { completeMargin, type Cost } from '../cost'

export interface ProductRow {
  product: Product
  cost: Cost
  colors: Color[]
}

export const SORTS = {
  no: 'No. 순',
  name: '이름순',
  marginAsc: '순마진율 낮은 순',
  marginDesc: '순마진율 높은 순',
  costDesc: '원가 높은 순',
} as const

export type Sort = keyof typeof SORTS

export interface ListFilter {
  q: string
  category: CategorySel
  needOnly: boolean // `입력 필요` 카드를 눌러 입력이 덜 된 제품만
  sort: Sort
}

export const NO_FILTER: ListFilter = { q: '', category: '', needOnly: false, sort: 'no' }

const byNo = (a: ProductRow, b: ProductRow) => a.product.no - b.product.no

// 입력이 덜 된 제품은 순마진율이 정확하지 않아 맨 뒤로 (방향과 상관없이)
const byMargin = (dir: 1 | -1) => (a: ProductRow, b: ProductRow) => {
  const ma = completeMargin(a.cost)
  const mb = completeMargin(b.cost)
  if (ma == null || mb == null) return Number(ma == null) - Number(mb == null) || byNo(a, b)
  return dir * (ma - mb) || byNo(a, b)
}

const sorters: Record<Sort, (a: ProductRow, b: ProductRow) => number> = {
  no: byNo,
  name: (a, b) => a.product.name.localeCompare(b.product.name, 'ko') || byNo(a, b),
  marginAsc: byMargin(1),
  marginDesc: byMargin(-1),
  costDesc: (a, b) => b.cost.cost - a.cost.cost || byNo(a, b),
}

// 검색: 제품명 · No. · 색상 이름
export function filterProducts(rows: ProductRow[], filter: ListFilter) {
  const q = filter.q.trim().toLowerCase()
  return rows
    .filter(
      ({ product, cost, colors }) =>
        inSelection(product, filter.category) &&
        (!filter.needOnly || cost.warnings.length > 0) &&
        (!q || [product.no, product.name, ...colors.map((c) => c.name)].join(' ').toLowerCase().includes(q)),
    )
    .sort(sorters[filter.sort])
}

// 맨 위 요약 (PRD-02). 평균 순마진율은 판매중이고 입력이 끝난 제품만
export function summarize(rows: ProductRow[]) {
  const count = (status: Product['status']) => rows.filter((r) => r.product.status === status).length
  const margins = rows
    .filter((r) => r.product.status === 'on_sale')
    .map((r) => completeMargin(r.cost))
    .filter((m) => m != null)
  return {
    onSale: count('on_sale'),
    developing: count('developing'),
    discontinued: count('discontinued'),
    total: rows.length,
    avgMargin: margins.length ? margins.reduce((a, m) => a + m, 0) / margins.length : null,
    avgBase: margins.length, // 평균에 들어간 제품 수 (툴팁용)
    needInput: rows.filter((r) => r.cost.warnings.length).length,
  }
}
